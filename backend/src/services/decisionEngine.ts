import { prisma } from '../config/database'
import { scoreOpportunityForClient } from '../engines/probabilityEngine'
import { logger } from '../utils/logger'

type Recommendation = 'NO_BID' | 'BID_SUB' | 'BID_PRIME'

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
      // USAspending enrichment fields
      incumbentProbability: true,
      competitionCount: true,
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

  if (!opportunity || !client) {
    throw new Error('Invalid opportunity or client')
  }

  // ------------------------------------------------------------
  // 1. Compliance Checks
  // ------------------------------------------------------------

  let complianceBlocked = false
  let riskScore = 0
  const triggeredFlags: string[] = []
  const requiredActions: string[] = []

  const naicsMatch = client.naicsCodes.some(
    (code) => code.trim() === opportunity.naicsCode.trim()
  )

  if (!naicsMatch) {
    complianceBlocked = true
    triggeredFlags.push('NAICS code mismatch')
    requiredActions.push('Verify NAICS code eligibility')
  }

  if (opportunity.setAsideType === 'SDVOSB' && !client.sdvosb) {
    complianceBlocked = true
    triggeredFlags.push('SDVOSB set-aside but client not SDVOSB certified')
    requiredActions.push('Obtain SDVOSB certification')
  }

  if (opportunity.setAsideType === 'WOSB' && !client.wosb) {
    complianceBlocked = true
    triggeredFlags.push('WOSB set-aside but client not WOSB certified')
    requiredActions.push('Obtain WOSB certification')
  }

  if (opportunity.setAsideType === 'HUBZONE' && !client.hubzone) {
    complianceBlocked = true
    triggeredFlags.push('HUBZone set-aside but client not HUBZone certified')
    requiredActions.push('Obtain HUBZone certification')
  }

  const daysToDeadline =
    (new Date(opportunity.responseDeadline).getTime() - Date.now()) /
    (1000 * 60 * 60 * 24)

  if (daysToDeadline < 3) {
    riskScore += 40
    triggeredFlags.push('Critical time compression (<3 days)')
  } else if (daysToDeadline < 7) {
    riskScore += 25
    triggeredFlags.push('High time compression risk (<7 days)')
  } else if (daysToDeadline < 20) {
    riskScore += 10
    triggeredFlags.push('Moderate time compression risk (<20 days)')
  }

  // ------------------------------------------------------------
  // 2. 8-Factor Win Probability Model (Logistic Sigmoid)
  // ------------------------------------------------------------

  const estValue = opportunity.estimatedValue
    ? Number(opportunity.estimatedValue)
    : null

  // Compute historical distribution score from award count
  let historicalDistribution = 0.3 // default (no data)
  if (opportunity.historicalAwardCount) {
    // More historical awards = more predictable market
    historicalDistribution = Math.min(opportunity.historicalAwardCount / 1000, 0.8)
  }

  const probabilityResult = scoreOpportunityForClient({
    opportunityNaics: opportunity.naicsCode,
    opportunitySetAside: opportunity.setAsideType || 'NONE',
    opportunityEstimatedValue: estValue,
    opportunityAgency: opportunity.agency,
    clientNaics: client.naicsCodes,
    clientProfile: {
      sdvosb: client.sdvosb,
      wosb: client.wosb,
      hubzone: client.hubzone,
      smallBusiness: client.smallBusiness,
    },
    // Tier 2: USAspending enrichment
    incumbentProbability: opportunity.incumbentProbability,
    competitionCount: opportunity.competitionCount,
    agencySdvosbRate: opportunity.agencySdvosbRate,
    historicalDistribution,
    // Tier 3: Document intelligence
    documentAlignmentScore: opportunity.documentIntelScore,
  })

  let winProbability = probabilityResult.probability

  // Log feature breakdown for transparency
  triggeredFlags.push(
    `8-factor model: raw=${probabilityResult.rawScore.toFixed(3)}, ` +
    `sigmoid=${winProbability.toFixed(3)}`
  )

  // ------------------------------------------------------------
  // 3. Recompete & Award Size Signals
  // ------------------------------------------------------------

  if (opportunity.recompeteFlag && opportunity.incumbentProbability !== null) {
    if (opportunity.incumbentProbability < 0.5) {
      winProbability = Math.min(winProbability * 1.05, 0.95)
      triggeredFlags.push('Recompete with weak incumbent — positive signal')
    } else {
      triggeredFlags.push(
        `Recompete with strong incumbent (${(opportunity.incumbentProbability * 100).toFixed(0)}% win rate)`
      )
    }
  }

  if (opportunity.historicalAvgAward && estValue) {
    const sizeRatio = estValue / Number(opportunity.historicalAvgAward)
    if (sizeRatio > 2.0) {
      triggeredFlags.push(
        `Contract value ${sizeRatio.toFixed(1)}x historical avg — potential scope expansion`
      )
      riskScore += 5
    } else if (sizeRatio < 0.5) {
      triggeredFlags.push(
        `Contract value ${sizeRatio.toFixed(1)}x historical avg — potential scope reduction`
      )
    }
  }

  if (opportunity.historicalWinner) {
    triggeredFlags.push(`Historical incumbent: ${opportunity.historicalWinner}`)
  }

  // ------------------------------------------------------------
  // 4. Bayesian Performance Calibration (Beta-Binomial)
  // ------------------------------------------------------------

  const stats = client.performanceStats

  if (stats && (stats.totalWon + stats.totalLost) > 0) {
    // Prior from model: pseudo-count of 10 reflects moderate confidence
    const pseudoCount = 10
    const alpha0 = winProbability * pseudoCount
    const beta0 = (1 - winProbability) * pseudoCount
    const alphaPosterior = alpha0 + stats.totalWon
    const betaPosterior = beta0 + stats.totalLost
    winProbability = alphaPosterior / (alphaPosterior + betaPosterior)

    // Penalty drag: exponential decay
    const totalPenalties = Number(stats.totalPenalties || 0)
    if (totalPenalties > 0) {
      const penaltyDrag = Math.exp(-totalPenalties / 200000)
      winProbability *= penaltyDrag
      triggeredFlags.push(
        `Penalty drag: ${(penaltyDrag * 100).toFixed(1)}% (${totalPenalties.toLocaleString()} total)`
      )
    }

    winProbability = Math.min(Math.max(winProbability, 0.01), 0.95)

    triggeredFlags.push(
      `Bayesian calibrated: ${stats.totalWon}W/${stats.totalLost}L ` +
      `(completion: ${((stats.completionRate || 0) * 100).toFixed(0)}%)`
    )
  } else if (stats && stats.totalSubmitted > 0) {
    // No win/loss data but has submission history — use completion rate
    const completionBoost = (stats.completionRate || 0.5) * 0.1
    winProbability = Math.min(winProbability + completionBoost, 0.95)
    triggeredFlags.push('Performance boost from submission history (no win/loss data)')
  }

  // ------------------------------------------------------------
  // 5. Financial Modeling
  // ------------------------------------------------------------

  const estimatedValue = estValue || 100000
  const proposalCostEstimate = estimatedValue * 0.05
  const expectedValue = winProbability * estimatedValue
  const netExpectedValue = expectedValue - proposalCostEstimate
  const roiRatio = proposalCostEstimate > 0
    ? netExpectedValue / proposalCostEstimate
    : 0

  // Competition-adjusted risk
  if (opportunity.competitionCount !== null && opportunity.competitionCount > 10) {
    riskScore += 15
    triggeredFlags.push(`High competition density (${opportunity.competitionCount} competitors)`)
  }

  // ------------------------------------------------------------
  // 6. Recommendation Logic
  // ------------------------------------------------------------

  let recommendation: Recommendation = 'NO_BID'
  const complianceStatus = complianceBlocked ? 'BLOCKED' : 'APPROVED'

  if (complianceBlocked) {
    recommendation = 'NO_BID'
    triggeredFlags.push('Compliance blocked — NO_BID enforced')
  } else if (roiRatio > 3 && winProbability > 0.35) {
    recommendation = 'BID_PRIME'
    triggeredFlags.push(
      `Strong opportunity: ROI ${roiRatio.toFixed(1)}x, probability ${(winProbability * 100).toFixed(0)}%`
    )
  } else if (roiRatio > 1.5 && winProbability > 0.2) {
    recommendation = 'BID_PRIME'
    triggeredFlags.push(
      `Moderate-strong opportunity: ROI ${roiRatio.toFixed(1)}x, probability ${(winProbability * 100).toFixed(0)}%`
    )
  } else if (winProbability > 0.2) {
    recommendation = 'BID_SUB'
    triggeredFlags.push(
      `Sub-contract opportunity: probability ${(winProbability * 100).toFixed(0)}%`
    )
  } else {
    triggeredFlags.push(
      `Below threshold: ROI ${roiRatio.toFixed(1)}x, probability ${(winProbability * 100).toFixed(0)}%`
    )
  }

  // ------------------------------------------------------------
  // 7. Persist Decision
  // ------------------------------------------------------------

  const consultingFirmId = opportunity.consultingFirmId

  const decision = await prisma.bidDecision.upsert({
    where: {
      opportunityId_clientCompanyId: {
        opportunityId,
        clientCompanyId,
      },
    },
    update: {
      winProbability,
      recommendation,
      expectedRevenue: estimatedValue,
      proposalCostEstimate,
      expectedValue,
      netExpectedValue,
      roiRatio,
      complianceStatus,
      riskScore,
      explanationJson: {
        triggeredFlags,
        requiredActions,
        daysToDeadline,
        naicsMatch,
        featureBreakdown: { ...probabilityResult.features },
        enrichmentUsed: opportunity.isEnriched || false,
        historicalWinner: opportunity.historicalWinner,
        competitionCount: opportunity.competitionCount,
      },
    },
    create: {
      consultingFirmId,
      opportunityId,
      clientCompanyId,
      winProbability,
      recommendation,
      expectedRevenue: estimatedValue,
      proposalCostEstimate,
      expectedValue,
      netExpectedValue,
      roiRatio,
      complianceStatus,
      riskScore,
      explanationJson: {
        triggeredFlags,
        requiredActions,
        daysToDeadline,
        naicsMatch,
        featureBreakdown: { ...probabilityResult.features },
        enrichmentUsed: opportunity.isEnriched || false,
        historicalWinner: opportunity.historicalWinner,
        competitionCount: opportunity.competitionCount,
      },
    },
  })

  logger.info('Bid decision evaluated', {
    opportunityId,
    clientCompanyId,
    recommendation,
    winProbability: winProbability.toFixed(3),
    enriched: opportunity.isEnriched,
  })

  return decision
}
