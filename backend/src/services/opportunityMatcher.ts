import { prisma } from '../config/database'
import { scoreOpportunityForClient } from '../engines/probabilityEngine'
import { logger } from '../utils/logger'

export interface MatchSuggestion {
  opportunityId: string
  opportunityTitle: string
  agency: string
  estimatedValue: number
  daysToDeadline: number
  clientId: string
  clientName: string
  matchScore: number       // 0-100
  winProbability: number
  expectedValue: number
  matchReasons: string[]
}

export async function findTopMatches(
  consultingFirmId: string,
  limit: number = 10
): Promise<MatchSuggestion[]> {
  try {
    // Get active opportunities with deadlines in the future
    const opportunities = await prisma.opportunity.findMany({
      where: {
        consultingFirmId,
        status: 'ACTIVE',
        responseDeadline: { gt: new Date() },
      },
      select: {
        id: true,
        title: true,
        agency: true,
        naicsCode: true,
        setAsideType: true,
        estimatedValue: true,
        responseDeadline: true,
        incumbentProbability: true,
        competitionCount: true,
        agencySdvosbRate: true,
        historicalAwardCount: true,
        documentIntelScore: true,
        isEnriched: true,
        bidDecisions: { select: { clientCompanyId: true } },
      },
    })

    // Get active clients
    const clients = await prisma.clientCompany.findMany({
      where: {
        consultingFirmId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        naicsCodes: true,
        sdvosb: true,
        wosb: true,
        hubzone: true,
        smallBusiness: true,
      },
    })

    const suggestions: MatchSuggestion[] = []

    for (const opp of opportunities) {
      const existingDecisionClients = new Set(
        opp.bidDecisions.map((d) => d.clientCompanyId)
      )

      for (const client of clients) {
        // Skip if decision already exists
        if (existingDecisionClients.has(client.id)) continue

        // Pre-filter: at least 2-digit NAICS prefix match
        const oppPrefix = opp.naicsCode.substring(0, 2)
        const hasNaicsOverlap = client.naicsCodes.some(
          (code) => code.substring(0, 2) === oppPrefix
        )
        if (!hasNaicsOverlap) continue

        const estValue = opp.estimatedValue ? Number(opp.estimatedValue) : null

        const result = scoreOpportunityForClient({
          opportunityNaics: opp.naicsCode,
          opportunitySetAside: opp.setAsideType || 'NONE',
          opportunityEstimatedValue: estValue,
          opportunityAgency: opp.agency,
          clientNaics: client.naicsCodes,
          clientProfile: {
            sdvosb: client.sdvosb,
            wosb: client.wosb,
            hubzone: client.hubzone,
            smallBusiness: client.smallBusiness,
          },
          incumbentProbability: opp.incumbentProbability,
          competitionCount: opp.competitionCount,
          agencySdvosbRate: opp.agencySdvosbRate,
          historicalDistribution: opp.historicalAwardCount
            ? Math.min(opp.historicalAwardCount / 1000, 0.8)
            : 0.3,
          documentAlignmentScore: opp.documentIntelScore,
        })

        // Only suggest if probability is meaningful
        if (result.probability < 0.15) continue

        const matchReasons: string[] = []
        const f = result.features

        if (f.naicsOverlapScore >= 0.8) matchReasons.push('Strong NAICS alignment')
        else if (f.naicsOverlapScore >= 0.5) matchReasons.push('Partial NAICS match')

        if (f.setAsideAlignmentScore === 1.0) matchReasons.push('Qualifies for set-aside')
        if (f.incumbentWeaknessScore > 0.7) matchReasons.push('Weak incumbent — opportunity to compete')
        if (f.documentAlignmentScore > 0.7) matchReasons.push('Strong SOW alignment')
        if (f.agencyAlignmentScore > 0.7) matchReasons.push('Favorable agency alignment')
        if (f.awardSizeFitScore > 0.8) matchReasons.push('Award size fits client capacity')
        if (f.competitionDensityScore > 0.7) matchReasons.push('Low competition density')

        if (opp.isEnriched) matchReasons.push('Enriched with historical data')

        const daysToDeadline = Math.ceil(
          (new Date(opp.responseDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )

        suggestions.push({
          opportunityId: opp.id,
          opportunityTitle: opp.title,
          agency: opp.agency,
          estimatedValue: estValue || 0,
          daysToDeadline,
          clientId: client.id,
          clientName: client.name,
          matchScore: Math.round(result.probability * 100),
          winProbability: result.probability,
          expectedValue: result.expectedValue,
          matchReasons,
        })
      }
    }

    // Sort by match score descending and take top results
    suggestions.sort((a, b) => b.matchScore - a.matchScore)
    return suggestions.slice(0, limit)
  } catch (err) {
    logger.error('Failed to compute opportunity matches', { error: err })
    return []
  }
}
