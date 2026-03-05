// =============================================================
// Firm Dashboard Routes
// Multi-tenant protected endpoints
// =============================================================

import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'

const router = Router()

router.get(
  '/dashboard',
  authenticateJWT,
  enforceTenantScope,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const consultingFirmId = getTenantId(req)

      const now = new Date()
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const twentyDays = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const [
        totalOpportunities,
        redOpps,
        yellowOpps,
        recentPenalties,
        topOpps,
        clientMetrics,
        pipelineValue,
        avgWinProb,
        recentDecisions,
        probDistribution,
      ] = await Promise.all([
        prisma.opportunity.count({
          where: { consultingFirmId },
        }),

        prisma.opportunity.count({
          where: {
            consultingFirmId,
            status: 'ACTIVE',
            responseDeadline: { gte: now, lte: sevenDays },
          },
        }),

        prisma.opportunity.count({
          where: {
            consultingFirmId,
            status: 'ACTIVE',
            responseDeadline: { gt: sevenDays, lte: twentyDays },
          },
        }),

        prisma.financialPenalty.aggregate({
          where: {
            consultingFirmId,
            createdAt: { gte: thirtyDaysAgo },
          },
          _sum: { amount: true },
          _count: true,
        }),

        prisma.opportunity.findMany({
          where: {
            consultingFirmId,
            status: 'ACTIVE',
            expectedValue: { gt: 0 },
          },
          orderBy: { expectedValue: 'desc' },
          take: 6,
          select: {
            id: true,
            title: true,
            agency: true,
            naicsCode: true,
            estimatedValue: true,
            probabilityScore: true,
            expectedValue: true,
            responseDeadline: true,
            setAsideType: true,
            isEnriched: true,
            historicalWinner: true,
            competitionCount: true,
            incumbentProbability: true,
            bidDecisions: {
              select: {
                recommendation: true,
                winProbability: true,
                complianceStatus: true,
                clientCompany: { select: { name: true } },
              },
              take: 3,
            },
          },
        }),

        // Client breakdown with performance stats
        prisma.clientCompany.findMany({
          where: { consultingFirmId, isActive: true },
          select: {
            id: true,
            name: true,
            performanceStats: {
              select: {
                completionRate: true,
                totalPenalties: true,
                totalWon: true,
                totalLost: true,
                totalSubmitted: true,
              },
            },
          },
        }),

        // Pipeline value aggregate
        prisma.opportunity.aggregate({
          where: { consultingFirmId, status: 'ACTIVE' },
          _sum: { expectedValue: true, estimatedValue: true },
        }),

        // Average win probability
        prisma.bidDecision.aggregate({
          where: { consultingFirmId },
          _avg: { winProbability: true },
        }),

        // Recent bid decisions
        prisma.bidDecision.findMany({
          where: { consultingFirmId },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            recommendation: true,
            winProbability: true,
            expectedValue: true,
            complianceStatus: true,
            riskScore: true,
            opportunity: { select: { id: true, title: true, agency: true } },
            clientCompany: { select: { id: true, name: true } },
          },
        }),

        // Probability distribution for histogram
        prisma.opportunity.groupBy({
          by: ['probabilityScore'],
          where: {
            consultingFirmId,
            isScored: true,
            probabilityScore: { gt: 0 },
          },
          _count: true,
        }),
      ])

      // Build client breakdown
      const clientBreakdown = clientMetrics.map((c) => ({
        id: c.id,
        name: c.name,
        completionRate: c.performanceStats?.completionRate || 0,
        totalPenalties: Number(c.performanceStats?.totalPenalties || 0),
        totalWon: c.performanceStats?.totalWon || 0,
        totalLost: c.performanceStats?.totalLost || 0,
        totalSubmitted: c.performanceStats?.totalSubmitted || 0,
      }))

      const totalClients = clientBreakdown.length
      const aggregateCompletionRate =
        totalClients > 0
          ? clientBreakdown.reduce((sum, c) => sum + c.completionRate, 0) / totalClients
          : 0

      // Bucket probabilities into 10% ranges
      const probBuckets = Array.from({ length: 10 }, (_, i) => ({
        range: `${i * 10}-${(i + 1) * 10}%`,
        count: 0,
      }))
      for (const row of probDistribution) {
        const bucket = Math.min(9, Math.floor(row.probabilityScore * 10))
        probBuckets[bucket].count += row._count
      }

      res.json({
        success: true,
        data: {
          totalOpportunities,

          deadlineAlerts: {
            red: redOpps,
            yellow: yellowOpps,
          },

          recentPenalties: {
            count: recentPenalties._count,
            total: Number(recentPenalties._sum.amount || 0),
          },

          pipelineValue: {
            totalExpected: Number(pipelineValue._sum.expectedValue || 0),
            totalEstimated: Number(pipelineValue._sum.estimatedValue || 0),
          },

          avgWinProbability: avgWinProb._avg.winProbability || 0,

          topOpportunities: topOpps.map((o) => ({
            ...o,
            estimatedValue: Number(o.estimatedValue || 0),
            expectedValue: Number(o.expectedValue || 0),
            deadline: {
              daysUntil: Math.ceil(
                (o.responseDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              ),
            },
          })),

          recentDecisions: recentDecisions.map((d) => ({
            ...d,
            expectedValue: Number(d.expectedValue || 0),
          })),

          firmMetrics: {
            totalClients,
            aggregateCompletionRate,
            clientBreakdown,
          },

          probDistribution: probBuckets,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
