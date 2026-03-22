import { prisma } from '../config/database'
import { logger } from '../utils/logger'

export interface ForecastMonth {
  period: string        // "2026-04"
  expected: number      // mean
  p10: number           // 10th percentile (pessimistic)
  p50: number           // median
  p90: number           // 90th percentile (optimistic)
  opportunityCount: number
}

export interface PortfolioHealth {
  revenueForecast: ForecastMonth[]
  totalExpectedRevenue: number
  diversification: {
    naicsConcentration: number         // HHI (0-1, lower = more diverse)
    agencyConcentration: number        // HHI (0-1)
    setAsideDistribution: { type: string; count: number; percent: number }[]
  }
  riskIndicators: {
    singleClientDependency: number     // % pipeline value from top client
    overdueSubmissionRate: number
    avgDaysToDeadlineAtSubmission: number
    pipelineCoverage: number           // total pipeline value / expected wins
  }
}

/**
 * Box-Muller transform for standard normal random variable.
 */
function gaussianRandom(): number {
  // Protect against Math.random() returning 0 (log(0) = -Infinity -> NaN)
  const u1 = Math.random() || Number.EPSILON
  const u2 = Math.random() || Number.EPSILON
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/**
 * Monte Carlo revenue forecast.
 * For each opportunity in the pipeline:
 *   - Draw Bernoulli(winProbability) to determine if won
 *   - If won, apply lognormal noise to estimated value
 * Run 1000 simulations, compute percentiles per month.
 */
export async function forecastRevenue(
  consultingFirmId: string,
  monthsAhead: number = 6,
  simulations: number = 1000
): Promise<ForecastMonth[]> {
  try {
    const now = new Date()
    const futureLimit = new Date(now)
    futureLimit.setMonth(futureLimit.getMonth() + monthsAhead)

    const opportunities = await prisma.opportunity.findMany({
      where: {
        consultingFirmId,
        status: 'ACTIVE',
        responseDeadline: { gte: now, lte: futureLimit },
      },
      select: {
        id: true,
        estimatedValue: true,
        probabilityScore: true,
        responseDeadline: true,
        recompeteFlag: true,
        incumbentProbability: true,
        bidDecisions: {
          select: { winProbability: true, recommendation: true },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    })

    // Time-to-Award NPV Discount: federal avg 9 months from deadline to award
    const TIME_TO_AWARD_DISCOUNT = 1 / Math.pow(1.08, 9 / 12) // ≈ 0.943
    const SUB_REVENUE_SHARE = 0.30
    const OPTION_YEAR_FACTOR = 2.5

    // Group opportunities by month
    const monthBuckets = new Map<string, { prob: number; value: number }[]>()

    for (const opp of opportunities) {
      const month = opp.responseDeadline.toISOString().substring(0, 7)
      const bestDecision = opp.bidDecisions[0]
      let prob = Number(bestDecision?.winProbability ?? opp.probabilityScore ?? 0)
      const baseValue = Number(opp.estimatedValue || 0)

      if (baseValue <= 0) continue
      // Use a conservative 12% floor for unscored/unmatched opportunities
      // so the forecast shows meaningful data even before scoring runs
      if (prob <= 0) prob = 0.12

      // Recompete boost (same logic as decisionEngine)
      if (opp.recompeteFlag) {
        const incProb = opp.incumbentProbability ? Number(opp.incumbentProbability) : null
        if (incProb !== null && incProb < 0.4) prob = Math.min(prob * 1.15, 0.90)
        else if (incProb !== null && incProb < 0.65) prob = Math.min(prob * 1.08, 0.90)
        else prob = Math.min(prob * 1.08, 0.90)
      }

      // Sub-contract revenue share: BID_SUB captures 30% of prime value
      const isSub = bestDecision?.recommendation === 'BID_SUB'
      const effectiveValue = isSub ? baseValue * SUB_REVENUE_SHARE : baseValue

      // Option Year Lifetime Value (use for pipeline projection)
      const lifetimeValue = effectiveValue * OPTION_YEAR_FACTOR

      // Apply time-to-award discount
      const value = lifetimeValue * TIME_TO_AWARD_DISCOUNT

      if (!monthBuckets.has(month)) monthBuckets.set(month, [])
      monthBuckets.get(month)!.push({ prob, value })
    }

    // Monte Carlo simulation
    const results = new Map<string, { sims: number[]; oppCount: number }>()

    for (const [month, opps] of monthBuckets) {
      const sims: number[] = []
      for (let s = 0; s < simulations; s++) {
        let total = 0
        for (const { prob, value } of opps) {
          if (Math.random() < prob) {
            // Lognormal noise: exp(N(0, sigma^2)) with sigma=0.2
            // E[lognormal] = exp(mu + sigma^2/2), so mu = -sigma^2/2 for unbiased
            const noise = Math.exp(-0.02 + 0.2 * gaussianRandom())
            total += value * noise
          }
        }
        sims.push(total)
      }
      sims.sort((a, b) => a - b)
      results.set(month, { sims, oppCount: opps.length })
    }

    // Generate month keys and extract percentiles
    const forecast: ForecastMonth[] = []
    for (let i = 0; i < monthsAhead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const period = d.toISOString().substring(0, 7)
      const data = results.get(period)

      if (!data || data.sims.length === 0) {
        forecast.push({ period, expected: 0, p10: 0, p50: 0, p90: 0, opportunityCount: 0 })
        continue
      }

      const { sims, oppCount } = data
      const mean = sims.reduce((a, b) => a + b, 0) / sims.length

      forecast.push({
        period,
        expected: Math.round(mean),
        p10: Math.round(sims[Math.floor(sims.length * 0.1)]),
        p50: Math.round(sims[Math.floor(sims.length * 0.5)]),
        p90: Math.round(sims[Math.floor(sims.length * 0.9)]),
        opportunityCount: oppCount,
      })
    }

    return forecast
  } catch (err) {
    logger.error('Failed to forecast revenue', { error: err })
    return []
  }
}

/**
 * Herfindahl-Hirschman Index for concentration measurement.
 * 0 = perfectly diverse, 1 = fully concentrated in one category.
 */
function computeHHI(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  return counts.reduce((hhi, count) => hhi + Math.pow(count / total, 2), 0)
}

export async function getPortfolioHealth(consultingFirmId: string): Promise<PortfolioHealth> {
  try {
    // Revenue forecast
    const revenueForecast = await forecastRevenue(consultingFirmId)
    const totalExpectedRevenue = revenueForecast.reduce((sum, m) => sum + m.expected, 0)

    // NAICS concentration
    const naicsGroups: { naics: string; count: bigint }[] = await prisma.$queryRaw`
      SELECT LEFT("naicsCode", 2) as naics, COUNT(*)::bigint as count
      FROM opportunities
      WHERE "consultingFirmId" = ${consultingFirmId} AND status = 'ACTIVE'
      GROUP BY LEFT("naicsCode", 2)
    `
    const naicsConcentration = computeHHI(naicsGroups.map((g) => Number(g.count)))

    // Agency concentration
    const agencyGroups: { agency: string; count: bigint }[] = await prisma.$queryRaw`
      SELECT agency, COUNT(*)::bigint as count
      FROM opportunities
      WHERE "consultingFirmId" = ${consultingFirmId} AND status = 'ACTIVE'
      GROUP BY agency
    `
    const agencyConcentration = computeHHI(agencyGroups.map((g) => Number(g.count)))

    // Set-aside distribution
    const setAsideGroups = await prisma.opportunity.groupBy({
      by: ['setAsideType'],
      where: { consultingFirmId, status: 'ACTIVE' },
      _count: true,
    })
    const totalSetAside = setAsideGroups.reduce((sum, g) => sum + g._count, 0)
    const setAsideDistribution = setAsideGroups.map((g) => ({
      type: g.setAsideType || 'NONE',
      count: g._count,
      percent: totalSetAside > 0 ? Math.round((g._count / totalSetAside) * 100) : 0,
    }))

    // Client dependency: top client's share of pipeline value via bid decisions
    const clientValues: { client_id: string; total_value: number }[] = await prisma.$queryRaw`
      SELECT "clientCompanyId" as client_id,
             COALESCE(SUM("expectedValue"::float), 0) as total_value
      FROM bid_decisions
      WHERE "consultingFirmId" = ${consultingFirmId}
      GROUP BY "clientCompanyId"
      ORDER BY total_value DESC
    `
    const totalPipelineValue = clientValues.reduce((s, c) => s + Number(c.total_value), 0)
    const singleClientDependency =
      totalPipelineValue > 0 && clientValues.length > 0
        ? Math.round((Number(clientValues[0].total_value) / totalPipelineValue) * 100)
        : 0

    // Overdue submission rate
    const submissionStats = await prisma.submissionRecord.aggregate({
      where: { consultingFirmId },
      _count: true,
    })
    const lateSubmissions = await prisma.submissionRecord.count({
      where: { consultingFirmId, wasOnTime: false },
    })
    const overdueSubmissionRate =
      submissionStats._count > 0
        ? Math.round((lateSubmissions / submissionStats._count) * 100)
        : 0

    // Avg days to deadline at submission time
    const avgDaysRaw: { avg_days: number }[] = await prisma.$queryRaw`
      SELECT COALESCE(
        AVG(
          EXTRACT(EPOCH FROM (o."responseDeadline" - sr."submittedAt")) / 86400
        )::float, 0
      ) as avg_days
      FROM submission_records sr
      JOIN opportunities o ON sr."opportunityId" = o.id
      WHERE sr."consultingFirmId" = ${consultingFirmId}
    `
    const avgDaysToDeadlineAtSubmission = Math.round(Number(avgDaysRaw[0]?.avg_days || 0))

    return {
      revenueForecast,
      totalExpectedRevenue,
      diversification: {
        naicsConcentration: Math.round(naicsConcentration * 100) / 100,
        agencyConcentration: Math.round(agencyConcentration * 100) / 100,
        setAsideDistribution,
      },
      riskIndicators: {
        singleClientDependency,
        overdueSubmissionRate,
        avgDaysToDeadlineAtSubmission,
        pipelineCoverage:
          totalExpectedRevenue > 0
            ? Math.round((totalPipelineValue / totalExpectedRevenue) * 100) / 100
            : 0,
      },
    }
  } catch (err) {
    logger.error('Failed to compute portfolio health', { error: err })
    return {
      revenueForecast: [],
      totalExpectedRevenue: 0,
      diversification: { naicsConcentration: 0, agencyConcentration: 0, setAsideDistribution: [] },
      riskIndicators: {
        singleClientDependency: 0,
        overdueSubmissionRate: 0,
        avgDaysToDeadlineAtSubmission: 0,
        pipelineCoverage: 0,
      },
    }
  }
}
