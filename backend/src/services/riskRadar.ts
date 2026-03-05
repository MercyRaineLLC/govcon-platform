import { prisma } from '../config/database'
import { logger } from '../utils/logger'

export interface RiskItem {
  entityType: 'DEADLINE' | 'COMPLIANCE' | 'PENALTY' | 'LATE_RISK'
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE'
  title: string
  description: string
  entityId: string
  linkedEntityId?: string   // e.g., clientId for LATE_RISK
  dueDate?: string
  score: number             // 0-100 composite risk score
}

export async function computeRiskRadar(consultingFirmId: string): Promise<RiskItem[]> {
  const risks: RiskItem[] = []

  try {
    // 1. Deadline risks: active opportunities with no submission and close deadlines
    const now = new Date()
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const twentyDays = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000)

    const urgentOpps = await prisma.opportunity.findMany({
      where: {
        consultingFirmId,
        status: 'ACTIVE',
        responseDeadline: { gt: now, lte: twentyDays },
      },
      select: {
        id: true,
        title: true,
        agency: true,
        responseDeadline: true,
        estimatedValue: true,
        submissionRecords: { select: { id: true }, take: 1 },
        bidDecisions: {
          select: { recommendation: true, clientCompanyId: true },
          where: { recommendation: 'BID_PRIME' },
          take: 1,
        },
      },
    })

    for (const opp of urgentOpps) {
      const daysLeft = Math.ceil(
        (opp.responseDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      const hasSubmission = opp.submissionRecords.length > 0
      const hasBidPrime = opp.bidDecisions.length > 0

      // Only flag if recommended to bid but no submission yet
      if (!hasSubmission && (hasBidPrime || daysLeft <= 3)) {
        const severity: RiskItem['severity'] =
          daysLeft <= 3 ? 'CRITICAL' : daysLeft <= 7 ? 'HIGH' : 'MODERATE'
        const score = Math.min(100, Math.round((1 - daysLeft / 20) * 100))

        risks.push({
          entityType: 'DEADLINE',
          severity,
          title: `${opp.title.substring(0, 60)}`,
          description: `${daysLeft} days remaining — ${
            hasSubmission ? 'submitted' : 'NO submission yet'
          }${hasBidPrime ? ' (BID_PRIME recommended)' : ''}`,
          entityId: opp.id,
          dueDate: opp.responseDeadline.toISOString(),
          score,
        })
      }
    }

    // 2. Compliance blocks: BidDecisions with BLOCKED status
    const blocked = await prisma.bidDecision.findMany({
      where: {
        consultingFirmId,
        complianceStatus: 'BLOCKED',
      },
      select: {
        id: true,
        opportunity: { select: { title: true } },
        clientCompany: { select: { name: true } },
      },
      take: 10,
    })

    for (const bd of blocked) {
      risks.push({
        entityType: 'COMPLIANCE',
        severity: 'HIGH',
        title: `Compliance Block: ${bd.clientCompany.name}`,
        description: `Blocked for "${bd.opportunity.title.substring(0, 50)}" — requires admin review`,
        entityId: bd.id,
        score: 75,
      })
    }

    // 3. Late submission risk per client (Beta distribution mean)
    const clientStats = await prisma.performanceStats.findMany({
      where: {
        clientCompany: { consultingFirmId, isActive: true },
        totalSubmitted: { gt: 0 },
      },
      include: {
        clientCompany: { select: { id: true, name: true } },
      },
    })

    for (const stat of clientStats) {
      // Beta(late+1, onTime+1) mean = (late+1) / (late+onTime+2)
      const lateProbability =
        (stat.submissionsLate + 1) / (stat.submissionsLate + stat.submissionsOnTime + 2)

      if (lateProbability > 0.3) {
        const severity: RiskItem['severity'] = lateProbability > 0.5 ? 'HIGH' : 'MODERATE'
        risks.push({
          entityType: 'LATE_RISK',
          severity,
          title: `Late risk: ${stat.clientCompany.name}`,
          description: `${(lateProbability * 100).toFixed(0)}% estimated late probability ` +
            `(${stat.submissionsLate} late / ${stat.totalSubmitted} total)`,
          entityId: stat.clientCompany.id,
          score: Math.round(lateProbability * 100),
        })
      }
    }

    // 4. Unpaid penalty accumulation
    const unpaidSummary: { client_id: string; client_name: string; total: number; count: bigint }[] =
      await prisma.$queryRaw`
        SELECT
          cc.id as client_id,
          cc.name as client_name,
          COALESCE(SUM(fp.amount)::float, 0) as total,
          COUNT(*)::bigint as count
        FROM financial_penalties fp
        JOIN client_companies cc ON fp."clientCompanyId" = cc.id
        WHERE fp."consultingFirmId" = ${consultingFirmId}
          AND fp."isPaid" = false
        GROUP BY cc.id, cc.name
        HAVING SUM(fp.amount) > 1000
        ORDER BY total DESC
        LIMIT 5
      `

    for (const row of unpaidSummary) {
      const severity: RiskItem['severity'] = Number(row.total) > 10000 ? 'HIGH' : 'MODERATE'
      risks.push({
        entityType: 'PENALTY',
        severity,
        title: `Unpaid penalties: ${row.client_name}`,
        description: `$${Number(row.total).toLocaleString()} outstanding across ${Number(row.count)} penalties`,
        entityId: row.client_id,
        score: Math.min(90, Math.round(Number(row.total) / 500)),
      })
    }

    // Sort by severity (CRITICAL > HIGH > MODERATE) then score
    const severityOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2 }
    risks.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.score - a.score
    )

    return risks
  } catch (err) {
    logger.error('Failed to compute risk radar', { error: err })
    return []
  }
}
