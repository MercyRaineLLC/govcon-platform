import { prisma } from '../config/database'
import { logger } from '../utils/logger'

export interface NaicsSectorTrend {
  naicsCode: string
  sector: string
  opportunityCount: number
  avgEstimatedValue: number
  avgCompetitionCount: number
  avgIncumbentDominance: number
  trend: 'growing' | 'declining' | 'stable'
}

export interface AgencyProfile {
  agency: string
  totalOpportunities: number
  smallBizRate: number
  sdvosbRate: number
  avgAwardSize: number
  topIncumbents: { name: string; winCount: number }[]
}

export interface CompetitiveLandscape {
  totalEnrichedOpportunities: number
  avgCompetitors: number
  incumbentDominanceDistribution: { bucket: string; count: number }[]
  recompetePercent: number
}

// NAICS sector labels (2-digit prefixes)
const NAICS_SECTORS: Record<string, string> = {
  '11': 'Agriculture', '21': 'Mining', '22': 'Utilities',
  '23': 'Construction', '31': 'Manufacturing', '32': 'Manufacturing',
  '33': 'Manufacturing', '42': 'Wholesale Trade', '44': 'Retail Trade',
  '45': 'Retail Trade', '48': 'Transportation', '49': 'Transportation',
  '51': 'Information', '52': 'Finance/Insurance', '53': 'Real Estate',
  '54': 'Professional Services', '55': 'Management', '56': 'Admin/Support',
  '61': 'Education', '62': 'Health Care', '71': 'Arts/Entertainment',
  '72': 'Accommodation/Food', '81': 'Other Services', '92': 'Public Admin',
}

/**
 * Linear regression slope for trend detection.
 * Positive slope = growing, negative = declining.
 */
function linearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return 0
  return (n * sumXY - sumX * sumY) / denom
}

export async function getNaicsTrends(consultingFirmId: string): Promise<NaicsSectorTrend[]> {
  try {
    const raw: {
      naics: string
      count: bigint
      avg_value: number
      avg_competition: number
      avg_incumbent: number
    }[] = await prisma.$queryRaw`
      SELECT
        LEFT("naicsCode", 2) as naics,
        COUNT(*)::bigint as count,
        COALESCE(AVG("estimatedValue"::float), 0) as avg_value,
        COALESCE(AVG("competitionCount"::float), 0) as avg_competition,
        COALESCE(AVG("incumbentProbability"::float), 0) as avg_incumbent
      FROM opportunities
      WHERE "consultingFirmId" = ${consultingFirmId}
        AND "naicsCode" IS NOT NULL AND "naicsCode" != ''
      GROUP BY LEFT("naicsCode", 2)
      HAVING COUNT(*) >= 2
      ORDER BY count DESC
      LIMIT 20
    `

    // For trend detection, get monthly counts per sector over last 6 months
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const monthly: { naics: string; period: string; count: bigint }[] = await prisma.$queryRaw`
      SELECT
        LEFT("naicsCode", 2) as naics,
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM') as period,
        COUNT(*)::bigint as count
      FROM opportunities
      WHERE "consultingFirmId" = ${consultingFirmId}
        AND "createdAt" >= ${sixMonthsAgo}
        AND "naicsCode" IS NOT NULL AND "naicsCode" != ''
      GROUP BY LEFT("naicsCode", 2), date_trunc('month', "createdAt")
      ORDER BY naics, period
    `

    // Build monthly count arrays per sector
    const monthlyBySector = new Map<string, number[]>()
    let currentSector = ''
    let currentValues: number[] = []
    for (const row of monthly) {
      if (row.naics !== currentSector) {
        if (currentSector) monthlyBySector.set(currentSector, currentValues)
        currentSector = row.naics
        currentValues = []
      }
      currentValues.push(Number(row.count))
    }
    if (currentSector) monthlyBySector.set(currentSector, currentValues)

    return raw.map((r) => {
      const values = monthlyBySector.get(r.naics) || []
      const slope = linearSlope(values)
      let trend: 'growing' | 'declining' | 'stable' = 'stable'
      if (slope > 0.5) trend = 'growing'
      else if (slope < -0.5) trend = 'declining'

      return {
        naicsCode: r.naics,
        sector: NAICS_SECTORS[r.naics] || 'Other',
        opportunityCount: Number(r.count),
        avgEstimatedValue: Math.round(Number(r.avg_value)),
        avgCompetitionCount: Math.round(Number(r.avg_competition) * 10) / 10,
        avgIncumbentDominance: Math.round(Number(r.avg_incumbent) * 100) / 100,
        trend,
      }
    })
  } catch (err) {
    logger.error('Failed to compute NAICS trends', { error: err })
    return []
  }
}

export async function getAgencyProfiles(consultingFirmId: string): Promise<AgencyProfile[]> {
  try {
    const raw: {
      agency: string
      count: bigint
      avg_sbr: number
      avg_sdvosb: number
      avg_award: number
    }[] = await prisma.$queryRaw`
      SELECT
        agency,
        COUNT(*)::bigint as count,
        COALESCE(AVG("agencySmallBizRate"::float), 0) as avg_sbr,
        COALESCE(AVG("agencySdvosbRate"::float), 0) as avg_sdvosb,
        COALESCE(AVG("historicalAvgAward"::float), 0) as avg_award
      FROM opportunities
      WHERE "consultingFirmId" = ${consultingFirmId}
        AND agency IS NOT NULL AND agency != ''
      GROUP BY agency
      HAVING COUNT(*) >= 2
      ORDER BY count DESC
      LIMIT 15
    `

    // Get top incumbents per agency
    const incumbents: { agency: string; winner: string; win_count: bigint }[] = await prisma.$queryRaw`
      SELECT
        o.agency,
        o."historicalWinner" as winner,
        COUNT(*)::bigint as win_count
      FROM opportunities o
      WHERE o."consultingFirmId" = ${consultingFirmId}
        AND o."historicalWinner" IS NOT NULL
        AND o."historicalWinner" != ''
      GROUP BY o.agency, o."historicalWinner"
      ORDER BY o.agency, win_count DESC
    `

    const incumbentMap = new Map<string, { name: string; winCount: number }[]>()
    for (const row of incumbents) {
      if (!incumbentMap.has(row.agency)) incumbentMap.set(row.agency, [])
      const arr = incumbentMap.get(row.agency)!
      if (arr.length < 3) arr.push({ name: row.winner, winCount: Number(row.win_count) })
    }

    return raw.map((r) => ({
      agency: r.agency,
      totalOpportunities: Number(r.count),
      smallBizRate: Math.round(Number(r.avg_sbr) * 100) / 100,
      sdvosbRate: Math.round(Number(r.avg_sdvosb) * 100) / 100,
      avgAwardSize: Math.round(Number(r.avg_award)),
      topIncumbents: incumbentMap.get(r.agency) || [],
    }))
  } catch (err) {
    logger.error('Failed to compute agency profiles', { error: err })
    return []
  }
}

export async function getCompetitiveLandscape(
  consultingFirmId: string
): Promise<CompetitiveLandscape> {
  try {
    const stats: { total: bigint; avg_comp: number; recompete_count: bigint }[] = await prisma.$queryRaw`
      SELECT
        COUNT(*)::bigint as total,
        COALESCE(AVG("competitionCount"::float), 0) as avg_comp,
        COUNT(*) FILTER (WHERE "recompeteFlag" = true)::bigint as recompete_count
      FROM opportunities
      WHERE "consultingFirmId" = ${consultingFirmId}
        AND "isEnriched" = true
    `

    // Incumbent dominance distribution — bucket by probability ranges
    const buckets: { bucket: string; count: bigint }[] = await prisma.$queryRaw`
      SELECT
        CASE
          WHEN "incumbentProbability" IS NULL THEN 'Unknown'
          WHEN "incumbentProbability" < 0.2 THEN '0-20% (Open)'
          WHEN "incumbentProbability" < 0.4 THEN '20-40% (Moderate)'
          WHEN "incumbentProbability" < 0.6 THEN '40-60% (Competitive)'
          WHEN "incumbentProbability" < 0.8 THEN '60-80% (Dominant)'
          ELSE '80-100% (Locked)'
        END as bucket,
        COUNT(*)::bigint as count
      FROM opportunities
      WHERE "consultingFirmId" = ${consultingFirmId}
        AND "isEnriched" = true
      GROUP BY bucket
      ORDER BY bucket
    `

    const s = stats[0]
    const total = Number(s?.total || 0)

    return {
      totalEnrichedOpportunities: total,
      avgCompetitors: Math.round(Number(s?.avg_comp || 0) * 10) / 10,
      incumbentDominanceDistribution: buckets.map((b) => ({
        bucket: b.bucket,
        count: Number(b.count),
      })),
      recompetePercent: total > 0
        ? Math.round((Number(s?.recompete_count || 0) / total) * 100)
        : 0,
    }
  } catch (err) {
    logger.error('Failed to compute competitive landscape', { error: err })
    return {
      totalEnrichedOpportunities: 0,
      avgCompetitors: 0,
      incumbentDominanceDistribution: [],
      recompetePercent: 0,
    }
  }
}
