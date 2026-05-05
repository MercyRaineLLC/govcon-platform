// =============================================================
// Decision Engine — 3-Layer Scoring Architecture
//
// Layer 1: Compliance Gate (complianceGate.ts)
//   → INELIGIBLE = hard stop, NO_BID immediately
//   → CONDITIONAL = proceed with risk penalty
//   → ELIGIBLE = proceed normally
//
// Layer 2: Fit Score (fitScoring.ts)
//   → 0-100 client capability vs opportunity requirements
//
// Layer 3: Market Score (marketScoring.ts)
//   → 0-100 opportunity attractiveness (independent of client)
//
// Win Probability: 7-factor logistic model (probabilityEngine.ts)
//   → Set-aside alignment removed — now handled by compliance gate
//
// Decision Matrix (decisionResolver.ts):
//   → fit ≥ 65 + market ≥ 60 → BID_PRIME
//   → fit ≥ 40 + market ≥ 40 → BID_SUB
//   → else → NO_BID
// =============================================================
import { prisma } from '../config/database'
import { scoreOpportunityForClient } from '../engines/probabilityEngine'
import { runComplianceGate } from '../engines/complianceGate'
import { computeFitScore } from '../engines/fitScoring'
import { computeMarketScore } from '../engines/marketScoring'
import { resolveDecision } from '../engines/decisionResolver'
import { logger } from '../utils/logger'

export async function evaluateBidDecision(
  opportunityId: string,
  clientCompanyId: string
) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: {
      id: true,
      consultingFirmId: true,
      naicsCode: true,
      setAsideType: true,
      estimatedValue: true,
      agency: true,
      responseDeadline: true,
      placeOfPerformance: true,
      noticeType: true,
      // USAspending enrichment
      incumbentProbability: true,
      competitionCount: true,
      offersReceived: true,
      agencySdvosbRate: true,
      agencySmallBizRate: true,
      historicalAwardCount: true,
      historicalAvgAward: true,
      historicalWinner: true,
      recompeteFlag: true,
      isEnriched: true,
      // Document intelligence
      documentIntelScore: true,
    },
  })

  const client = await prisma.clientCompany.findUnique({
    where: { id: clientCompanyId },
    include: { performanceStats: true },
  })

  if (!opportunity || !client || !client.isActive) {
    throw new Error('Invalid opportunity or client')
  }
  if (client.consultingFirmId !== opportunity.consultingFirmId) {
    throw new Error('Client does not belong to the same consulting firm')
  }

  const consultingFirmId = opportunity.consultingFirmId
  const estValue = opportunity.estimatedValue ? Number(opportunity.estimatedValue) : null

  // ──────────────────────────────────────────────────────────
  // LAYER 1: Compliance Gate
  // ──────────────────────────────────────────────────────────
  const complianceResult = runComplianceGate(
    {
      sdvosb: client.sdvosb,
      wosb: client.wosb,
      hubzone: client.hubzone,
      smallBusiness: client.smallBusiness,
      naicsCodes: client.naicsCodes,
      samRegStatus: client.samRegStatus,
      samRegExpiry: client.samRegExpiry,
    },
    {
      setAsideType: opportunity.setAsideType || 'NONE',
      naicsCode: opportunity.naicsCode,
    }
  )

  // ──────────────────────────────────────────────────────────
  // SHORT CIRCUIT: INELIGIBLE → persist NO_BID and return
  // ──────────────────────────────────────────────────────────
  if (complianceResult.gate === 'INELIGIBLE') {
    logger.info('Bid decision: INELIGIBLE (compliance gate)', {
      opportunityId,
      clientCompanyId,
      blockers: complianceResult.blockers,
    })

    const ineligibleDecision = await prisma.bidDecision.upsert({
      where: { opportunityId_clientCompanyId: { opportunityId, clientCompanyId } },
      update: {
        recommendation: 'NO_BID',
        complianceGate: 'INELIGIBLE',
        fitScore: null,
        marketScore: null,
        winProbability: 0,
        complianceStatus: 'BLOCKED',
        riskScore: 100,
        rationale: complianceResult.blockers.join('; '),
        explanationJson: {
          complianceGate: 'INELIGIBLE',
          blockers: complianceResult.blockers,
          requiredActions: complianceResult.requiredActions,
          fitScore: null,
          marketScore: null,
          triggeredFlags: complianceResult.blockers,
          requiredActionsForClient: complianceResult.requiredActions,
        },
      },
      create: {
        consultingFirmId,
        opportunityId,
        clientCompanyId,
        recommendation: 'NO_BID',
        complianceGate: 'INELIGIBLE',
        fitScore: null,
        marketScore: null,
        winProbability: 0,
        complianceStatus: 'BLOCKED',
        riskScore: 100,
        rationale: complianceResult.blockers.join('; '),
        explanationJson: {
          complianceGate: 'INELIGIBLE',
          blockers: complianceResult.blockers,
          requiredActions: complianceResult.requiredActions,
          fitScore: null,
          marketScore: null,
          triggeredFlags: complianceResult.blockers,
          requiredActionsForClient: complianceResult.requiredActions,
        },
      },
    })

    // Record ineligible decision in audit trail (non-blocking)
    prisma.bidDecisionHistory.create({
      data: {
        consultingFirmId,
        opportunityId,
        clientCompanyId,
        recommendation: 'NO_BID',
        winProbability: 0,
        changeReason: `INELIGIBLE: ${complianceResult.blockers.join('; ')}`,
      },
    }).catch((err: Error) => {
      logger.warn('Failed to write NO_BID compliance log for ineligible decision', { opportunityId, clientCompanyId, error: err.message })
    })

    return ineligibleDecision
  }

  // ──────────────────────────────────────────────────────────
  // LAYER 2: Fit Score (client capability)
  // ──────────────────────────────────────────────────────────
  const fitResult = computeFitScore(
    {
      naicsCodes: client.naicsCodes,
      sdvosb: client.sdvosb,
      wosb: client.wosb,
      hubzone: client.hubzone,
      smallBusiness: client.smallBusiness,
      state: client.state,
      performanceStats: client.performanceStats
        ? {
            totalWon: client.performanceStats.totalWon,
            totalLost: client.performanceStats.totalLost,
            totalSubmitted: client.performanceStats.totalSubmitted,
            completionRate: client.performanceStats.completionRate,
            totalPenalties: String(client.performanceStats.totalPenalties),
          }
        : null,
    },
    {
      naicsCode: opportunity.naicsCode,
      estimatedValue: estValue,
      responseDeadline: new Date(opportunity.responseDeadline),
      placeOfPerformance: opportunity.placeOfPerformance,
      historicalAvgAward: opportunity.historicalAvgAward ? Number(opportunity.historicalAvgAward) : null,
    }
  )

  // ──────────────────────────────────────────────────────────
  // LAYER 3: Market Score (opportunity attractiveness)
  // ──────────────────────────────────────────────────────────
  const marketResult = computeMarketScore({
    offersReceived: opportunity.offersReceived,
    competitionCount: opportunity.competitionCount,
    incumbentProbability: opportunity.incumbentProbability,
    recompeteFlag: opportunity.recompeteFlag,
    estimatedValue: estValue,
    historicalAvgAward: opportunity.historicalAvgAward ? Number(opportunity.historicalAvgAward) : null,
    noticeType: opportunity.noticeType,
    setAsideType: opportunity.setAsideType || 'NONE',
    agencySmallBizRate: opportunity.agencySmallBizRate,
    agencySdvosbRate: opportunity.agencySdvosbRate,
    clientProfile: {
      sdvosb: client.sdvosb,
      wosb: client.wosb,
      hubzone: client.hubzone,
      smallBusiness: client.smallBusiness,
    },
  })

  // ──────────────────────────────────────────────────────────
  // WIN PROBABILITY: 7-factor logistic model
  // ──────────────────────────────────────────────────────────
  let historicalDistribution = 0.3
  if (opportunity.historicalAwardCount) {
    historicalDistribution = Math.min(opportunity.historicalAwardCount / 1000, 0.8)
  }

  const probabilityResult = scoreOpportunityForClient({
    opportunityNaics: opportunity.naicsCode,
    opportunityEstimatedValue: estValue,
    opportunityAgency: opportunity.agency,
    clientNaics: client.naicsCodes,
    clientProfile: {
      sdvosb: client.sdvosb,
      wosb: client.wosb,
      hubzone: client.hubzone,
      smallBusiness: client.smallBusiness,
    },
    incumbentProbability: opportunity.incumbentProbability,
    competitionCount: opportunity.competitionCount,
    offersReceived: opportunity.offersReceived,
    agencySdvosbRate: opportunity.agencySdvosbRate,
    historicalDistribution,
    documentAlignmentScore: opportunity.documentIntelScore,
  })

  let winProbability = probabilityResult.probability

  const triggeredFlags: string[] = []

  // Recompete boosts
  if (opportunity.recompeteFlag) {
    const incProb = opportunity.incumbentProbability
    if (incProb !== null && incProb < 0.4) {
      winProbability = Math.min(winProbability * 1.15, 0.90)
      triggeredFlags.push('Recompete — weak incumbent detected (+15% probability boost)')
    } else if (incProb !== null && incProb < 0.65) {
      winProbability = Math.min(winProbability * 1.08, 0.90)
      triggeredFlags.push(`Recompete — moderate incumbent (${(incProb * 100).toFixed(0)}% prior win rate, +8% boost)`)
    } else {
      winProbability = Math.min(winProbability * 1.08, 0.90)
      triggeredFlags.push('Recompete detected — incumbent vulnerable (+8% boost)')
    }
  }

  if (opportunity.historicalWinner) {
    triggeredFlags.push(`Historical incumbent: ${opportunity.historicalWinner}`)
  }

  // Bayesian Beta-Binomial calibration
  const stats = client.performanceStats
  if (stats && (stats.totalWon + stats.totalLost) > 0) {
    const pseudoCount = 10
    const alpha0 = winProbability * pseudoCount
    const beta0 = (1 - winProbability) * pseudoCount
    const alphaPosterior = alpha0 + stats.totalWon
    const betaPosterior = beta0 + stats.totalLost
    winProbability = alphaPosterior / (alphaPosterior + betaPosterior)

    const totalPenalties = Number(stats.totalPenalties || 0)
    if (totalPenalties > 0) {
      const penaltyDrag = Math.exp(-totalPenalties / 200000)
      winProbability *= penaltyDrag
      triggeredFlags.push(`Penalty drag: ${(penaltyDrag * 100).toFixed(1)}% (${totalPenalties.toLocaleString()} total)`)
    }

    winProbability = Math.min(Math.max(winProbability, 0.01), 0.95)
    triggeredFlags.push(
      `Bayesian calibrated: ${stats.totalWon}W/${stats.totalLost}L (completion: ${((stats.completionRate || 0) * 100).toFixed(0)}%)`
    )
  }

  // ──────────────────────────────────────────────────────────
  // DECISION RESOLVER: combine all 3 layers
  // ──────────────────────────────────────────────────────────
  const allComplianceFlags = [...complianceResult.blockers, ...complianceResult.conditions]
  const decisionOutput = resolveDecision(
    complianceResult.gate,
    fitResult.total,
    marketResult.total,
    allComplianceFlags
  )

  // Apply confidence modifier from resolver
  winProbability = Math.min(Math.max(winProbability + decisionOutput.confidenceModifier, 0.01), 0.95)

  const recommendation = decisionOutput.recommendation
  const complianceStatus = complianceResult.gate === 'CONDITIONAL' ? 'PENDING' : 'APPROVED'

  // ──────────────────────────────────────────────────────────
  // FINANCIAL MODELING
  // ──────────────────────────────────────────────────────────
  const estimatedValue = estValue || 100000
  const OPTION_YEAR_FACTOR = 2.5
  const SUB_REVENUE_SHARE = 0.30
  const TIME_TO_AWARD_DISCOUNT = 1 / Math.pow(1.08, 9 / 12)

  const isSubBid = recommendation === 'BID_SUB'
  const effectiveContractValue = isSubBid ? estimatedValue * SUB_REVENUE_SHARE : estimatedValue
  const proposalCostEstimate = isSubBid ? estimatedValue * 0.03 : estimatedValue * 0.05
  const lifetimeValue = Math.round(estimatedValue * OPTION_YEAR_FACTOR)
  const expectedValue = winProbability * effectiveContractValue * TIME_TO_AWARD_DISCOUNT
  const netExpectedValue = expectedValue - proposalCostEstimate
  const roiRatio = proposalCostEstimate > 0 ? netExpectedValue / proposalCostEstimate : 0
  const expectedLifetimeValue = Math.round(winProbability * lifetimeValue * TIME_TO_AWARD_DISCOUNT)

  // Deadline risk
  const daysToDeadline = (new Date(opportunity.responseDeadline).getTime() - Date.now()) / 86400000
  if (daysToDeadline < 3) triggeredFlags.push('Critical time compression (<3 days)')
  else if (daysToDeadline < 7) triggeredFlags.push('High time compression (<7 days)')
  else if (daysToDeadline < 20) triggeredFlags.push('Moderate time compression (<20 days)')

  if (opportunity.competitionCount !== null && opportunity.competitionCount !== undefined && opportunity.competitionCount > 10) {
    triggeredFlags.push(`High historical competition density (${opportunity.competitionCount} unique winners)`)
  }
  if (opportunity.offersReceived !== null && opportunity.offersReceived !== undefined && opportunity.offersReceived > 10) {
    triggeredFlags.push(`High offer count per solicitation (${opportunity.offersReceived} offerors on record)`)
  }

  triggeredFlags.push(
    `7-factor model: raw=${probabilityResult.rawScore.toFixed(3)}, sigmoid=${probabilityResult.probability.toFixed(3)}`
  )
  triggeredFlags.push(`Fit score: ${fitResult.total}/100 | Market score: ${marketResult.total}/100`)
  triggeredFlags.push(`Decision resolver: ${decisionOutput.rationale}`)

  // ──────────────────────────────────────────────────────────
  // PERSIST DECISION
  // ──────────────────────────────────────────────────────────
  const explanationJson = {
    // 3-layer breakdown
    complianceGate: complianceResult.gate,
    blockers: complianceResult.blockers,
    conditions: complianceResult.conditions,
    requiredActions: complianceResult.requiredActions,
    fitScore: fitResult.total,
    fitBreakdown: fitResult.breakdown,
    marketScore: marketResult.total,
    marketBreakdown: marketResult.breakdown,
    // Probability model
    featureBreakdown: { ...probabilityResult.features },
    rawProbabilityScore: probabilityResult.rawScore,
    // Context
    triggeredFlags,
    daysToDeadline,
    enrichmentUsed: opportunity.isEnriched || false,
    historicalWinner: opportunity.historicalWinner,
    competitionCount: opportunity.competitionCount,
    offersReceived: opportunity.offersReceived,
    // Financial
    lifetimeValue,
    expectedLifetimeValue,
    effectiveContractValue: Math.round(effectiveContractValue),
    timeToAwardDiscount: Math.round(TIME_TO_AWARD_DISCOUNT * 1000) / 1000,
    subContractShare: isSubBid ? SUB_REVENUE_SHARE : null,
    optionYearFactor: OPTION_YEAR_FACTOR,
    roiRatio: Math.round(roiRatio * 100) / 100,
  }

  const decision = await prisma.bidDecision.upsert({
    where: { opportunityId_clientCompanyId: { opportunityId, clientCompanyId } },
    update: {
      recommendation,
      complianceGate: complianceResult.gate,
      fitScore: fitResult.total,
      marketScore: marketResult.total,
      winProbability,
      expectedRevenue: estimatedValue,
      proposalCostEstimate,
      expectedValue,
      netExpectedValue,
      roiRatio,
      complianceStatus,
      riskScore: decisionOutput.riskScore,
      explanationJson: { ...explanationJson },
    },
    create: {
      consultingFirmId,
      opportunityId,
      clientCompanyId,
      recommendation,
      complianceGate: complianceResult.gate,
      fitScore: fitResult.total,
      marketScore: marketResult.total,
      winProbability,
      expectedRevenue: estimatedValue,
      proposalCostEstimate,
      expectedValue,
      netExpectedValue,
      roiRatio,
      complianceStatus,
      riskScore: decisionOutput.riskScore,
      explanationJson: { ...explanationJson },
    },
  })

  // Record decision in audit trail (non-blocking)
  prisma.bidDecisionHistory.create({
    data: {
      consultingFirmId,
      opportunityId,
      clientCompanyId,
      recommendation,
      winProbability,
      fitScore: fitResult.total,
      marketScore: marketResult.total,
      expectedValue,
      roiRatio,
      snapshotJson: { ...explanationJson },
    },
  }).catch((e: unknown) => logger.warn('Failed to log decision history', { error: (e as Error).message }))

  logger.info('Bid decision evaluated (3-layer)', {
    opportunityId,
    clientCompanyId,
    complianceGate: complianceResult.gate,
    fitScore: fitResult.total,
    marketScore: marketResult.total,
    recommendation,
    winProbability: winProbability.toFixed(3),
  })

  return decision
}
