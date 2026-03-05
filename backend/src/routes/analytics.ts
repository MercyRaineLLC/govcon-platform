import { Router, Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../types'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { prisma } from '../config/database'
import {
  getSubmissionTrends,
  getPenaltyTrends,
  getWinRateTrends,
  getOpportunityVolumeTrends,
} from '../services/trendAnalysis'
import {
  getNaicsTrends,
  getAgencyProfiles,
  getCompetitiveLandscape,
} from '../services/marketIntelligence'
import { findTopMatches } from '../services/opportunityMatcher'
import { computeRiskRadar } from '../services/riskRadar'
import { getPortfolioHealth } from '../services/revenueForecaster'
import { logger } from '../utils/logger'

const router = Router()

// All analytics routes require auth + tenant scope
router.use(authenticateJWT, enforceTenantScope)

// =============================================================
// GET /api/analytics/trends
// Time-series data for all trend charts
// =============================================================
router.get(
  '/trends',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)
      const months = Math.min(parseInt(req.query.months as string) || 12, 24)

      const [submissions, penalties, winRate, volume] = await Promise.all([
        getSubmissionTrends(consultingFirmId, months),
        getPenaltyTrends(consultingFirmId, months),
        getWinRateTrends(consultingFirmId, months),
        getOpportunityVolumeTrends(consultingFirmId, months),
      ])

      res.json({
        success: true,
        data: { submissions, penalties, winRate, volume },
      })
    } catch (err) {
      next(err)
    }
  }
)

// =============================================================
// GET /api/analytics/pipeline
// Opportunity pipeline funnel
// =============================================================
router.get(
  '/pipeline',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)

      const [ingested, scored, decided, submitted, wonStats] = await Promise.all([
        prisma.opportunity.count({ where: { consultingFirmId } }),

        prisma.opportunity.count({
          where: { consultingFirmId, isScored: true },
        }),

        prisma.bidDecision.count({
          where: { consultingFirmId, recommendation: { not: null } },
        }),

        prisma.submissionRecord.count({ where: { consultingFirmId } }),

        prisma.performanceStats.aggregate({
          where: { clientCompany: { consultingFirmId } },
          _sum: { totalWon: true },
        }),
      ])

      const won = wonStats._sum.totalWon || 0

      const stages = [
        { label: 'Ingested', count: ingested },
        { label: 'Scored', count: scored },
        { label: 'Decided', count: decided },
        { label: 'Submitted', count: submitted },
        { label: 'Won', count: won },
      ]

      const conversionRates = []
      for (let i = 0; i < stages.length - 1; i++) {
        conversionRates.push({
          fromStage: stages[i].label,
          toStage: stages[i + 1].label,
          rate:
            stages[i].count > 0
              ? Math.round((stages[i + 1].count / stages[i].count) * 100)
              : 0,
        })
      }

      res.json({
        success: true,
        data: { stages, conversionRates },
      })
    } catch (err) {
      next(err)
    }
  }
)

// =============================================================
// GET /api/analytics/market-intelligence
// NAICS trends, agency profiles, competitive landscape
// =============================================================
router.get(
  '/market-intelligence',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)

      const [naicsTrends, agencyProfiles, competitiveLandscape] = await Promise.all([
        getNaicsTrends(consultingFirmId),
        getAgencyProfiles(consultingFirmId),
        getCompetitiveLandscape(consultingFirmId),
      ])

      res.json({
        success: true,
        data: { naicsTrends, agencyProfiles, competitiveLandscape },
      })
    } catch (err) {
      next(err)
    }
  }
)

// =============================================================
// GET /api/analytics/predictions
// Opportunity suggestions + risk radar
// =============================================================
router.get(
  '/predictions',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)

      const [opportunitySuggestions, riskItems] = await Promise.all([
        findTopMatches(consultingFirmId, 10),
        computeRiskRadar(consultingFirmId),
      ])

      // Generate recommended actions from risk items
      const recommendedActions = riskItems
        .filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH')
        .slice(0, 5)
        .map((r, i) => ({
          priority: i + 1,
          action:
            r.entityType === 'DEADLINE'
              ? `Submit proposal for "${r.title}" — ${r.description}`
              : r.entityType === 'COMPLIANCE'
              ? `Review compliance block: ${r.description}`
              : `Address: ${r.description}`,
          entityType: r.entityType,
          entityId: r.entityId,
        }))

      res.json({
        success: true,
        data: {
          opportunitySuggestions,
          riskItems,
          recommendedActions,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// =============================================================
// GET /api/analytics/portfolio-health
// Revenue forecasting + diversification + risk indicators
// =============================================================
router.get(
  '/portfolio-health',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)
      const health = await getPortfolioHealth(consultingFirmId)

      res.json({
        success: true,
        data: health,
      })
    } catch (err) {
      next(err)
    }
  }
)

// =============================================================
// GET /api/analytics/compliance-logs
// Audit trail query
// =============================================================
router.get(
  '/compliance-logs',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)
      const {
        entityType,
        entityId,
        page = '1',
        limit = '50',
      } = req.query as Record<string, string>

      const pageNum = Math.max(1, parseInt(page) || 1)
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50))

      const where: any = { consultingFirmId }
      if (entityType) where.entityType = entityType
      if (entityId) where.entityId = entityId

      const [logs, total] = await Promise.all([
        prisma.complianceLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.complianceLog.count({ where }),
      ])

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
