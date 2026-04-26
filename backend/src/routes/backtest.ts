// =============================================================
// Backtest admin routes — model calibration against historical wins
// Admin-only. Backtest data is NOT tenant-scoped (industry-wide
// federal contract data), but the run is audit-attributed to the
// firm that triggered it.
// =============================================================
import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { authenticateJWT, requireRole } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { ValidationError, NotFoundError } from '../utils/errors'
import { runBacktest } from '../services/backtest/historicalBacktest'
import { logger } from '../utils/logger'

const router = Router()
router.use(authenticateJWT, enforceTenantScope, requireRole('ADMIN'))

/**
 * POST /api/admin/backtest/run
 * Body: { sampleSize?: number, yearsBack?: number }
 * Synchronous — holds the connection while the backtest runs (~5–15 min
 * for 1k samples). For larger runs, switch to a BullMQ job in v2.
 */
router.post('/run', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const sampleSize = Math.min(2000, Math.max(50, parseInt(req.body?.sampleSize) || 1000))
    const yearsBack = Math.min(10, Math.max(1, parseInt(req.body?.yearsBack) || 5))

    const consultingFirmId = getTenantId(req)
    const userId = req.user?.userId

    logger.info('Backtest run requested', { consultingFirmId, userId, sampleSize, yearsBack })

    // Run synchronously — caller waits. Long-running but acceptable for MVP.
    res.setTimeout?.(30 * 60 * 1000) // 30 min
    const runId = await runBacktest({
      consultingFirmId,
      triggeredBy: userId,
      sampleSize,
      yearsBack,
    })

    res.json({ success: true, data: { runId } })
  } catch (err: any) {
    next(err)
  }
})

/**
 * GET /api/admin/backtest/runs
 * List recent backtest runs (most recent first).
 */
router.get('/runs', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const runs = await prisma.backtestRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 25,
      select: {
        id: true,
        status: true,
        sampleSize: true,
        yearsBack: true,
        startedAt: true,
        completedAt: true,
        predictionCount: true,
        brierScore: true,
        meanProbability: true,
        errorMessage: true,
      },
    })
    res.json({ success: true, data: runs })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/admin/backtest/runs/:id
 * Detail view: aggregate metrics + top mispredictions.
 */
router.get('/runs/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const run = await prisma.backtestRun.findUnique({
      where: { id: req.params.id },
    })
    if (!run) throw new NotFoundError('Backtest run not found')

    // Top mispredictions = winners we gave LOW probability to.
    // For winners-only sample, the most informative cases are the lowest
    // predicted probabilities — i.e. winners we'd have told a firm not to bid.
    const mispredictions = await prisma.backtestPrediction.findMany({
      where: { runId: run.id },
      orderBy: { predictedProbability: 'asc' },
      take: 20,
      select: {
        contractId: true,
        agency: true,
        naicsCode: true,
        awardAmount: true,
        awardDate: true,
        recipientName: true,
        predictedProbability: true,
        syntheticClientNaics: true,
        syntheticSdvosb: true,
        syntheticWosb: true,
        syntheticHubzone: true,
        syntheticSmallBiz: true,
      },
    })

    res.json({ success: true, data: { run, mispredictions } })
  } catch (err) {
    next(err)
  }
})

export default router
