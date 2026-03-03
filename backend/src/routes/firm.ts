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
      ] = await Promise.all([
        prisma.opportunity.count({
          where: { consultingFirmId },
        }),

        prisma.opportunity.count({
          where: {
            consultingFirmId,
            status: 'ACTIVE',
            responseDeadline: {
              gte: now,
              lte: sevenDays,
            },
          },
        }),

        prisma.opportunity.count({
          where: {
            consultingFirmId,
            status: 'ACTIVE',
            responseDeadline: {
              gt: sevenDays,
              lte: twentyDays,
            },
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
          take: 5,
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
          },
        }),
      ])

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

          topOpportunities: topOpps.map((o) => ({
            ...o,
            deadline: {
              daysUntil: Math.ceil(
                (o.responseDeadline.getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
              ),
            },
          })),
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router