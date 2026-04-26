// =============================================================
// Historical Backtest Service — calibration of the 8-factor
// probability engine against real federal contract winners.
//
// MVP scope: 1k sampled awards, winners-only (no synthetic
// competitors), report-only metrics (no weight changes).
// =============================================================
import { prisma } from '../../config/database'
import { logger } from '../../utils/logger'
import { usaSpendingService } from '../usaSpending'
import { lookupEntityByUEI, lookupEntityByName } from '../samEntityApi'
import { scoreOpportunityForClient } from '../../engines/probabilityEngine'

export interface BacktestRunOpts {
  consultingFirmId: string
  triggeredBy?: string
  sampleSize?: number   // default 1000
  yearsBack?: number    // default 5
}

interface CalibrationBin {
  binMin: number
  binMax: number
  count: number
  meanPred: number
  observedRate: number
}

/**
 * Run a backtest end-to-end. Synchronous (caller holds the connection
 * for ~5–15 minutes depending on sample size). Caller is the admin
 * route handler.
 */
export async function runBacktest(opts: BacktestRunOpts) {
  const sampleSize = opts.sampleSize ?? 1000
  const yearsBack = opts.yearsBack ?? 5

  const run = await prisma.backtestRun.create({
    data: {
      consultingFirmId: opts.consultingFirmId,
      triggeredBy: opts.triggeredBy,
      status: 'RUNNING',
      sampleSize,
      yearsBack,
    },
  })

  logger.info('Backtest run started', { runId: run.id, sampleSize, yearsBack })

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

    // 2. Score each award
    const predictions: Array<{
      probability: number
      features: any
      rawScore: number
      record: typeof awards[number]
      synthetic: { naics: string[]; sdvosb: boolean; wosb: boolean; hubzone: boolean; smallBiz: boolean }
    }> = []

    for (let i = 0; i < awards.length; i++) {
      const award = awards[i]

      // Look up winner profile from SAM Entity API
      let synthetic = {
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
          synthetic = {
            naics: entity.naicsCodes && entity.naicsCodes.length > 0
              ? entity.naicsCodes
              : [award.naicsCode],
            sdvosb: !!entity.sdvosb,
            wosb: !!entity.wosb,
            hubzone: !!entity.hubzone,
            smallBiz: !!entity.smallBusiness,
          }
        }
      } catch (err) {
        // Entity lookup failure → fall back to defaults; proceed.
      }

      // Score using the SAME engine production uses
      const result = scoreOpportunityForClient({
        opportunityNaics: award.naicsCode,
        opportunityEstimatedValue: award.awardAmount,
        opportunityAgency: award.agency,
        clientNaics: synthetic.naics,
        clientProfile: {
          sdvosb: synthetic.sdvosb,
          wosb: synthetic.wosb,
          hubzone: synthetic.hubzone,
          smallBusiness: synthetic.smallBiz,
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
        synthetic,
      })

      // Store every Nth row to avoid one giant insert at the end
      if ((i + 1) % 50 === 0) {
        logger.info('Backtest progress', { runId: run.id, scored: i + 1, total: awards.length })
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
          observedOutcome: 1.0,
        })),
      })
    }

    // 4. Compute aggregate metrics
    const probs = predictions.map((p) => p.probability)
    const meanProbability = probs.reduce((a, b) => a + b, 0) / probs.length
    // Brier vs observed=1 for all winners. (For winners-only sample, this is
    // mean((1 - p)^2) — high prob → low loss, low prob → high loss.)
    const brierScore = probs.reduce((a, p) => a + (1 - p) ** 2, 0) / probs.length

    // Calibration bins (10 bins of 0.1 width)
    const calibrationBins: CalibrationBin[] = []
    for (let b = 0; b < 10; b++) {
      const min = b * 0.1
      const max = (b + 1) * 0.1
      const inBin = predictions.filter((p) => p.probability >= min && p.probability < max + (b === 9 ? 0.0001 : 0))
      if (inBin.length === 0) {
        calibrationBins.push({ binMin: min, binMax: max, count: 0, meanPred: 0, observedRate: 0 })
        continue
      }
      const meanPred = inBin.reduce((a, p) => a + p.probability, 0) / inBin.length
      // Observed rate is 1 since all are winners (this is the limitation
      // we flagged in the proposal — without losers the calibration plot
      // is mainly useful for spotting low-confidence predictions on
      // actual winners).
      calibrationBins.push({ binMin: min, binMax: max, count: inBin.length, meanPred, observedRate: 1 })
    }

    // Per-feature mean for the winners
    const featureKeys = Object.keys(predictions[0].features)
    const factorMeans: Record<string, number> = {}
    for (const key of featureKeys) {
      const sum = predictions.reduce((a, p) => a + (p.features[key] || 0), 0)
      factorMeans[key] = sum / predictions.length
    }

    // 5. Write run summary
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
      predictions: predictions.length,
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
