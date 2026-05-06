// =============================================================
// Historical Backtest Service — calibration of the 8-factor
// probability engine against real federal contract winners.
//
// Each USAspending award produces K labeled predictions:
//   - 1 POSITIVE: synthetic client matching the actual winner.
//                 observedOutcome = 1.0
//   - K-1 NEGATIVES: deliberately-mismatched synthetic clients
//                 (wrong NAICS / wrong size / wrong set-aside).
//                 observedOutcome = 0.0
//
// This produces realistic calibration curves: predicted-probability
// deciles plotted against observed win rate. Without negatives the
// curve is uninformative because every observation is a winner.
//
// Hybrid roadmap: when SubmissionRecord.outcome ships in Phase 2
// of the calibration plan, runBacktest will gain a 'real' source
// branch that uses bid-vs-award labels instead of synthetic.
// =============================================================
import { prisma } from '../../config/database'
import { logger } from '../../utils/logger'
import { usaSpendingService } from '../usaSpending'
import { lookupEntityByUEI, lookupEntityByName } from '../samEntityApi'
import { scoreOpportunityForClient } from '../../engines/probabilityEngine'

export interface BacktestRunOpts {
  consultingFirmId: string
  triggeredBy?: string
  sampleSize?: number             // default 1000 (number of awards sampled)
  yearsBack?: number              // default 5
  predictionsPerAward?: number    // default 4 (1 positive + 3 negatives)
}

interface CalibrationBin {
  binMin: number
  binMax: number
  count: number
  meanPred: number
  observedRate: number
}

interface SyntheticProfile {
  naics: string[]
  sdvosb: boolean
  wosb: boolean
  hubzone: boolean
  smallBiz: boolean
}

/** Produces up to `count` deliberately-mismatched profiles for a given award. */
export function buildSyntheticNegatives(
  awardNaics: string,
  winner: SyntheticProfile,
  count: number,
): SyntheticProfile[] {
  if (count <= 0) return []

  const currentSector = (awardNaics || '00').slice(0, 2)
  // NAICS sectors deliberately distant from most winners — the
  // overlap factor scores 0 for cross-sector mismatches.
  const distantSectors = ['11', '21', '52', '71', '72', '92']
  const distantSector = distantSectors.find((s) => s !== currentSector) ?? '11'
  const wrongNaics = `${distantSector}9999`

  const variants: SyntheticProfile[] = [
    // Variant 1 — wrong NAICS sector entirely. Should score very low.
    {
      naics: [wrongNaics],
      sdvosb: winner.sdvosb,
      wosb: winner.wosb,
      hubzone: winner.hubzone,
      smallBiz: winner.smallBiz,
    },
    // Variant 2 — right NAICS, but wrong size class. Federal small-biz
    // set-asides exclude large business; this should score moderately
    // (NAICS match) but be excluded by award-size + agency factors.
    {
      naics: [awardNaics],
      sdvosb: false,
      wosb: false,
      hubzone: false,
      smallBiz: !winner.smallBiz,
    },
    // Variant 3 — right NAICS + size, wrong set-aside flags inverted.
    // Realistic close-but-no-cigar bidder — should score in mid-range.
    {
      naics: [awardNaics],
      sdvosb: !winner.sdvosb,
      wosb: !winner.wosb,
      hubzone: !winner.hubzone,
      smallBiz: winner.smallBiz,
    },
  ]

  return variants.slice(0, count)
}

/**
 * Run a backtest end-to-end. Synchronous (caller holds the connection
 * for ~5–15 minutes depending on sample size). Caller is the admin
 * route handler.
 */
export async function runBacktest(opts: BacktestRunOpts) {
  const sampleSize = opts.sampleSize ?? 1000
  const yearsBack = opts.yearsBack ?? 5
  const K = Math.max(1, Math.min(10, opts.predictionsPerAward ?? 4))

  const run = await prisma.backtestRun.create({
    data: {
      consultingFirmId: opts.consultingFirmId,
      triggeredBy: opts.triggeredBy,
      status: 'RUNNING',
      sampleSize,
      yearsBack,
    },
  })

  logger.info('Backtest run started', { runId: run.id, sampleSize, yearsBack, K })

  try {
    // 1. Sample awarded contracts
    const awards = await usaSpendingService.sampleAwardedContracts({
      yearsBack,
      sampleSize,
    })
    logger.info('Backtest awards sampled', { runId: run.id, count: awards.length })

    if (awards.length === 0) {
      throw new Error('USAspending returned zero awards — check API connectivity')
    }

    // 2. Score each award + K-1 synthetic negatives
    interface Prediction {
      probability: number
      // ProbabilityFeatures is a typed object — keep it as `any` here
      // because we treat it as a generic record when computing means.
      features: any
      rawScore: number
      record: typeof awards[number]
      synthetic: SyntheticProfile
      observedOutcome: number  // 1.0 winner, 0.0 mismatched negative
    }
    const predictions: Prediction[] = []

    for (let i = 0; i < awards.length; i++) {
      const award = awards[i]

      // Look up actual winner profile from SAM Entity API
      let winner: SyntheticProfile = {
        naics: [award.naicsCode],
        sdvosb: false,
        wosb: false,
        hubzone: false,
        smallBiz: true, // default — most federal awards go to small business
      }

      try {
        const entity = award.recipientUei
          ? await lookupEntityByUEI(award.recipientUei)
          : await lookupEntityByName(award.recipientName)
        if (entity) {
          winner = {
            naics: entity.naicsCodes && entity.naicsCodes.length > 0
              ? entity.naicsCodes
              : [award.naicsCode],
            sdvosb: !!entity.sdvosb,
            wosb: !!entity.wosb,
            hubzone: !!entity.hubzone,
            smallBiz: !!entity.smallBusiness,
          }
        }
      } catch {
        // Entity lookup failure → fall back to defaults; proceed.
      }

      // Build the K profiles to score: 1 positive + K-1 negatives.
      const negatives = buildSyntheticNegatives(award.naicsCode, winner, K - 1)
      const profiles: Array<{ profile: SyntheticProfile; observed: number }> = [
        { profile: winner, observed: 1 },
        ...negatives.map((n) => ({ profile: n, observed: 0 })),
      ]

      for (const { profile, observed } of profiles) {
        const result = scoreOpportunityForClient({
          opportunityNaics: award.naicsCode,
          opportunityEstimatedValue: award.awardAmount,
          opportunityAgency: award.agency,
          clientNaics: profile.naics,
          clientProfile: {
            sdvosb: profile.sdvosb,
            wosb: profile.wosb,
            hubzone: profile.hubzone,
            smallBusiness: profile.smallBiz,
          },
          // We deliberately DO NOT pass historical-derived signals
          // (incumbentProbability, agencySdvosbRate, etc.) — those would
          // create time leakage. The engine fills neutral defaults.
        })

        predictions.push({
          probability: result.probability,
          features: result.features,
          rawScore: result.rawScore,
          record: award,
          synthetic: profile,
          observedOutcome: observed,
        })
      }

      if ((i + 1) % 50 === 0) {
        logger.info('Backtest progress', {
          runId: run.id,
          awardsScored: i + 1,
          totalAwards: awards.length,
          predictionsBuilt: predictions.length,
        })
      }
    }

    // 3. Persist predictions in batches
    const BATCH = 200
    for (let i = 0; i < predictions.length; i += BATCH) {
      const slice = predictions.slice(i, i + BATCH)
      await prisma.backtestPrediction.createMany({
        data: slice.map((p) => ({
          runId: run.id,
          contractId: p.record.contractId,
          agency: p.record.agency,
          naicsCode: p.record.naicsCode,
          awardAmount: p.record.awardAmount,
          awardDate: new Date(p.record.awardDate || Date.now()),
          recipientName: p.record.recipientName,
          recipientUei: p.record.recipientUei,
          syntheticClientNaics: p.synthetic.naics,
          syntheticSdvosb: p.synthetic.sdvosb,
          syntheticWosb: p.synthetic.wosb,
          syntheticHubzone: p.synthetic.hubzone,
          syntheticSmallBiz: p.synthetic.smallBiz,
          predictedProbability: p.probability,
          rawScore: p.rawScore,
          features: p.features as any,
          observedOutcome: p.observedOutcome,
        })),
      })
    }

    // 4. Compute aggregate metrics — Brier score across the FULL labeled
    //    sample (positives + negatives), not just winners.
    const meanProbability =
      predictions.reduce((a, p) => a + p.probability, 0) / predictions.length
    const brierScore =
      predictions.reduce((a, p) => a + (p.observedOutcome - p.probability) ** 2, 0) /
      predictions.length

    // 5. Calibration bins — observed win rate per predicted-prob decile.
    //    With mixed labels this becomes a real calibration curve.
    const calibrationBins: CalibrationBin[] = []
    for (let b = 0; b < 10; b++) {
      const min = b * 0.1
      const max = (b + 1) * 0.1
      const inBin = predictions.filter(
        (p) => p.probability >= min && p.probability < max + (b === 9 ? 0.0001 : 0),
      )
      if (inBin.length === 0) {
        calibrationBins.push({ binMin: min, binMax: max, count: 0, meanPred: 0, observedRate: 0 })
        continue
      }
      const meanPred = inBin.reduce((a, p) => a + p.probability, 0) / inBin.length
      const observedRate =
        inBin.reduce((a, p) => a + p.observedOutcome, 0) / inBin.length
      calibrationBins.push({
        binMin: min,
        binMax: max,
        count: inBin.length,
        meanPred,
        observedRate,
      })
    }

    // 6. Per-feature mean for the WINNERS only (interpretable as "the
    //    average factor profile of an actual award winner"). Negatives
    //    by construction have lower factor values, so mixing them in
    //    would dilute the diagnostic value of this slice.
    const winnerPredictions = predictions.filter((p) => p.observedOutcome === 1)
    const factorMeans: Record<string, number> = {}
    if (winnerPredictions.length > 0) {
      const featureKeys = Object.keys(winnerPredictions[0].features)
      for (const key of featureKeys) {
        const sum = winnerPredictions.reduce((a, p) => a + (p.features[key] || 0), 0)
        factorMeans[key] = sum / winnerPredictions.length
      }
    }

    // 7. Write run summary
    await prisma.backtestRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        predictionCount: predictions.length,
        brierScore,
        meanProbability,
        calibrationBins: calibrationBins as any,
        factorMeans: factorMeans as any,
      },
    })

    logger.info('Backtest run complete', {
      runId: run.id,
      awards: awards.length,
      predictions: predictions.length,
      positives: winnerPredictions.length,
      negatives: predictions.length - winnerPredictions.length,
      brierScore: brierScore.toFixed(4),
      meanProbability: meanProbability.toFixed(3),
    })

    return run.id
  } catch (err) {
    const msg = (err as Error).message
    logger.error('Backtest run failed', { runId: run.id, error: msg })
    await prisma.backtestRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', completedAt: new Date(), errorMessage: msg },
    })
    throw err
  }
}
