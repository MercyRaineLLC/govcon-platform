// =============================================================
// Market Analytics Routes — BigQuery-powered decision intelligence
// All routes require JWT auth. Scoped to the firm's NAICS portfolio.
// =============================================================
import { Router, Response } from 'express'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { prisma } from '../config/database'
import { ensureBigQueryDataset } from '../config/bigquery'
import {
  getCompetitionProfile,
  getAgencyProfile,
  getContractorProfile,
  getMarketSnapshot,
  getAwardHistoryCount,
} from '../services/bigquery/analyticsService'
import { ingestAwardsForNaics, ingestBulkNaics } from '../services/bigquery/ingestionService'
import { logger } from '../utils/logger'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// ── Status ────────────────────────────────────────────────────

/**
 * GET /api/market-analytics/status
 * Returns BQ connectivity + row count. Used by frontend to show "data available" state.
 */
router.get('/status', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureBigQueryDataset()
    const count = await getAwardHistoryCount()
    res.json({
      success: true,
      data: {
        connected: count >= 0,
        awardRows: count < 0 ? 0 : count,
        hasData: count > 0,
      },
    })
  } catch (err) {
    logger.error('BQ status check failed', { error: (err as Error).message })
    res.json({ success: true, data: { connected: false, awardRows: 0, hasData: false } })
  }
})

// ── Competition Profile ───────────────────────────────────────

/**
 * GET /api/market-analytics/competition/:naicsCode
 * Full competition profile: top winners, HHI, offers received, set-aside breakdown.
 * Optional query param: ?agency=Department+of+Veterans+Affairs
 */
router.get('/competition/:naicsCode', async (req: AuthenticatedRequest, res: Response) => {
  const { naicsCode } = req.params
  const agency = req.query.agency as string | undefined

  if (!naicsCode || naicsCode.length < 4) {
    return res.status(400).json({ success: false, error: 'naicsCode must be at least 4 digits' })
  }

  try {
    const profile = await getCompetitionProfile(naicsCode, agency)
    if (!profile || profile.dataPoints === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No data in BigQuery for this NAICS. Run /ingest first.',
      })
    }
    res.json({ success: true, data: profile })
  } catch (err) {
    logger.error('Competition profile route failed', { naicsCode, error: (err as Error).message })
    res.status(500).json({ success: false, error: 'Failed to load competition profile' })
  }
})

// ── Agency Profile ────────────────────────────────────────────

/**
 * GET /api/market-analytics/agency/:agencyName
 * Agency buying profile: SB/SDVOSB/WOSB/HUBZone rates, top NAICS, avg award.
 */
router.get('/agency/:agencyName', async (req: AuthenticatedRequest, res: Response) => {
  const agency = decodeURIComponent(req.params.agencyName)

  try {
    const profile = await getAgencyProfile(agency)
    if (!profile || profile.dataPoints === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No data in BigQuery for this agency. Run /ingest first.',
      })
    }
    res.json({ success: true, data: profile })
  } catch (err) {
    logger.error('Agency profile route failed', { agency, error: (err as Error).message })
    res.status(500).json({ success: false, error: 'Failed to load agency profile' })
  }
})

// ── Contractor Profile ────────────────────────────────────────

/**
 * GET /api/market-analytics/contractor/:name
 * Incumbent / competitor win history by recipient name.
 */
router.get('/contractor/:name', async (req: AuthenticatedRequest, res: Response) => {
  const recipientName = decodeURIComponent(req.params.name)

  try {
    const profile = await getContractorProfile(recipientName)
    if (!profile) {
      return res.json({
        success: true,
        data: null,
        message: 'No award history found for this contractor.',
      })
    }
    res.json({ success: true, data: profile })
  } catch (err) {
    logger.error('Contractor profile route failed', { recipientName, error: (err as Error).message })
    res.status(500).json({ success: false, error: 'Failed to load contractor profile' })
  }
})

// ── Market Snapshot ───────────────────────────────────────────

/**
 * GET /api/market-analytics/snapshot
 * Firm-wide multi-NAICS market snapshot.
 * Automatically uses the consulting firm's client NAICS codes.
 * Optional override: ?naics=541511,541519
 */
router.get('/snapshot', async (req: AuthenticatedRequest, res: Response) => {
  const firmId = req.user?.consultingFirmId
  if (!firmId) return res.status(401).json({ success: false, error: 'Unauthorized' })

  try {
    let naicsCodes: string[]

    if (req.query.naics) {
      naicsCodes = (req.query.naics as string).split(',').map((s) => s.trim()).filter(Boolean)
    } else {
      // Pull all unique NAICS codes from the firm's active clients
      const clients = await prisma.clientCompany.findMany({
        where: { consultingFirmId: firmId, isActive: true },
        select: { naicsCodes: true },
      })
      const allCodes = clients.flatMap((c) => c.naicsCodes)
      naicsCodes = [...new Set(allCodes)]
    }

    if (naicsCodes.length === 0) {
      return res.json({ success: true, data: null, message: 'No NAICS codes found for this firm.' })
    }

    const snapshot = await getMarketSnapshot(naicsCodes)
    res.json({ success: true, data: snapshot })
  } catch (err) {
    logger.error('Market snapshot route failed', { error: (err as Error).message })
    res.status(500).json({ success: false, error: 'Failed to load market snapshot' })
  }
})

// ── Ingestion (Admin) ─────────────────────────────────────────

/**
 * POST /api/market-analytics/ingest
 * Trigger USAspending → BigQuery ingestion for a NAICS code.
 * Body: { naicsCode: string, agency?: string, maxPages?: number }
 *
 * For bulk firm-wide backfill:
 * Body: { bulk: true } — uses all client NAICS codes
 */
router.post('/ingest', async (req: AuthenticatedRequest, res: Response) => {
  const firmId = req.user?.consultingFirmId
  const role   = req.user?.role

  if (!firmId) return res.status(401).json({ success: false, error: 'Unauthorized' })
  if (role !== 'ADMIN') return res.status(403).json({ success: false, error: 'Admin only' })

  try {
    await ensureBigQueryDataset()

    if (req.body.bulk) {
      // Bulk ingest — fire and forget, return immediately
      const clients = await prisma.clientCompany.findMany({
        where: { consultingFirmId: firmId, isActive: true },
        select: { naicsCodes: true },
      })
      const allCodes = [...new Set(clients.flatMap((c) => c.naicsCodes))]

      if (allCodes.length === 0) {
        return res.json({ success: true, message: 'No NAICS codes to ingest.' })
      }

      ingestBulkNaics(allCodes, { maxPages: req.body.maxPages ?? 5, yearsBack: req.body.yearsBack ?? 5 }).catch((err) =>
        logger.error('Bulk BQ ingestion failed', { error: (err as Error).message })
      )

      return res.json({
        success: true,
        message: `Bulk ingestion started for ${allCodes.length} NAICS codes. Runs in background.`,
        naicsCodes: allCodes,
      })
    }

    // Custom list ingest — { naicsCodes: string[], maxPages?, yearsBack? }
    if (Array.isArray(req.body.naicsCodes) && req.body.naicsCodes.length > 0) {
      const codes: string[] = [...new Set(req.body.naicsCodes as string[])]
      ingestBulkNaics(codes, { maxPages: req.body.maxPages ?? 20, yearsBack: req.body.yearsBack ?? 7 }).catch((err) =>
        logger.error('Custom-list BQ ingestion failed', { error: (err as Error).message })
      )
      return res.json({
        success: true,
        message: `Mass ingestion started for ${codes.length} NAICS codes (${req.body.maxPages ?? 20} pages × ${req.body.yearsBack ?? 7}yr each). Runs in background.`,
        naicsCodes: codes,
      })
    }

    const { naicsCode, agency, maxPages = 20, yearsBack = 7 } = req.body
    if (!naicsCode) {
      return res.status(400).json({ success: false, error: 'naicsCode is required' })
    }

    const result = await ingestAwardsForNaics({ naicsCode, agency, maxPages, yearsBack })
    res.json({ success: true, data: result })
  } catch (err) {
    logger.error('Ingest route failed', { error: (err as Error).message })
    res.status(500).json({ success: false, error: 'Ingestion failed' })
  }
})

export default router
