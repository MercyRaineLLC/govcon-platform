// =============================================================
// State & Municipal Opportunities Route
// Manages state/county/municipal government contract pipeline
// =============================================================
import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { logger } from '../utils/logger'
import axios from 'axios'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// =============================================================
// GET /api/state-municipal/opportunities
// =============================================================
router.get('/opportunities', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { state, level, search, limit = '50', offset = '0' } = req.query as Record<string, string>

    const where: Record<string, unknown> = { consultingFirmId }
    if (state)  where.state         = state
    if (level)  where.contractLevel = level
    if (search) where.title         = { contains: search, mode: 'insensitive' }

    const [opportunities, total] = await Promise.all([
      prisma.stateMunicipalOpportunity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.stateMunicipalOpportunity.count({ where }),
    ])

    res.json({ success: true, data: { opportunities, total } })
  } catch (err) { next(err) }
})

// =============================================================
// GET /api/state-municipal/stats
// =============================================================
router.get('/stats', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const [total, byLevel, byState] = await Promise.all([
      prisma.stateMunicipalOpportunity.count({ where: { consultingFirmId } }),
      prisma.stateMunicipalOpportunity.groupBy({
        by: ['contractLevel'],
        where: { consultingFirmId },
        _count: { _all: true },
      }),
      prisma.stateMunicipalOpportunity.groupBy({
        by: ['state'],
        where: { consultingFirmId },
        _count: { _all: true },
        orderBy: { _count: { state: 'desc' } },
        take: 10,
      }),
    ])
    res.json({ success: true, data: { total, byLevel, byState } })
  } catch (err) { next(err) }
})

// =============================================================
// POST /api/state-municipal/sync
// Pull state/municipal contract data from open data sources
// =============================================================
router.post('/sync', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    res.json({ success: true, message: 'State & municipal sync started. Pulling from open data sources.' })

    // Fire and forget — pull from multiple state procurement APIs
    setImmediate(async () => {
      try {
        await syncStateMunicipalData(consultingFirmId)
      } catch (err) {
        logger.error('State/municipal sync failed', { error: (err as Error).message })
      }
    })
  } catch (err) { next(err) }
})

// =============================================================
// POST /api/state-municipal/opportunities  (manual add)
// =============================================================
router.post('/opportunities', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { title, agency, state, contractLevel, naicsCode, estimatedValue,
            responseDeadline, description, solicitationNumber, contactEmail, sourceUrl } = req.body

    if (!title || !agency || !state) {
      return res.status(400).json({ success: false, error: 'title, agency, and state are required' })
    }

    const opp = await prisma.stateMunicipalOpportunity.create({
      data: {
        consultingFirmId, title, agency, state,
        contractLevel: contractLevel ?? 'STATE',
        naicsCode: naicsCode ?? null,
        estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
        responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
        description: description ?? null,
        solicitationNumber: solicitationNumber ?? null,
        contactEmail: contactEmail ?? null,
        sourceUrl: sourceUrl ?? null,
      },
    })
    res.status(201).json({ success: true, data: opp })
  } catch (err) { next(err) }
})

// =============================================================
// DELETE /api/state-municipal/opportunities/:id
// =============================================================
router.delete('/opportunities/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const existing = await prisma.stateMunicipalOpportunity.findFirst({
      where: { id: req.params.id, consultingFirmId },
    })
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' })
    await prisma.stateMunicipalOpportunity.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// =============================================================
// Internal: sync from public state procurement portals
// Uses USAspending sub-award data filtered to state agencies,
// plus a curated set of known state eProcurement portals
// =============================================================
async function syncStateMunicipalData(consultingFirmId: string): Promise<void> {
  const USA_SPENDING = 'https://api.usaspending.gov/api/v2'

  // Pull subawards / grants from state agencies via USAspending
  // Filter by awarding agency type = LOCAL
  const stateAgencyFilters = [
    { name: 'California', abbr: 'CA', type: 'STATE' as const },
    { name: 'Texas', abbr: 'TX', type: 'STATE' as const },
    { name: 'Florida', abbr: 'FL', type: 'STATE' as const },
    { name: 'New York', abbr: 'NY', type: 'STATE' as const },
    { name: 'Virginia', abbr: 'VA', type: 'STATE' as const },
    { name: 'Maryland', abbr: 'MD', type: 'STATE' as const },
    { name: 'Georgia', abbr: 'GA', type: 'STATE' as const },
    { name: 'Pennsylvania', abbr: 'PA', type: 'STATE' as const },
    { name: 'Ohio', abbr: 'OH', type: 'STATE' as const },
    { name: 'Illinois', abbr: 'IL', type: 'STATE' as const },
    { name: 'North Carolina', abbr: 'NC', type: 'STATE' as const },
    { name: 'Michigan', abbr: 'MI', type: 'STATE' as const },
    { name: 'Washington', abbr: 'WA', type: 'STATE' as const },
    { name: 'Arizona', abbr: 'AZ', type: 'STATE' as const },
    { name: 'Colorado', abbr: 'CO', type: 'STATE' as const },
  ]

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let created = 0

  for (const stateInfo of stateAgencyFilters) {
    try {
      const resp = await axios.post(
        `${USA_SPENDING}/search/spending_by_award/`,
        {
          filters: {
            time_period: [{ start_date: startDate, end_date: endDate }],
            place_of_performance_states: [stateInfo.abbr],
            award_type_codes: ['02', '03', '04', '05'], // grants + cooperative agreements
          },
          fields: ['Award Amount', 'Recipient Name', 'Award Date', 'Award Type',
                   'generated_internal_id', 'Description', 'Awarding Agency', 'place_of_performance_state_name'],
          page: 1,
          limit: 50,
          sort: 'Award Amount',
          order: 'desc',
        },
        { timeout: 20000 }
      )

      const results: Record<string, unknown>[] = resp.data?.results ?? []

      for (const r of results) {
        const externalId = `usaspending-state-${r['generated_internal_id']}`
        const existing = await prisma.subcontractOpportunity.findUnique({ where: { externalId } })
        if (existing) continue

        await prisma.stateMunicipalOpportunity.create({
          data: {
            consultingFirmId,
            title: (r['Description'] as string) || `${stateInfo.name} Grant/Contract`,
            agency: (r['Awarding Agency'] as string) || stateInfo.name,
            state: stateInfo.abbr,
            contractLevel: stateInfo.type,
            estimatedValue: r['Award Amount'] ? parseFloat(r['Award Amount'] as string) : null,
            description: `Federal grant/cooperative agreement with state agency in ${stateInfo.name}. Recipient: ${r['Recipient Name']}`,
            status: 'ACTIVE',
            postedAt: r['Award Date'] ? new Date(r['Award Date'] as string) : null,
          },
        })
        created++
      }

      // Polite delay
      await new Promise((resolve) => setTimeout(resolve, 800))
    } catch (err) {
      logger.warn(`State sync failed for ${stateInfo.name}`, { error: (err as Error).message })
    }
  }

  logger.info('State/municipal sync complete', { consultingFirmId, created })
}

export default router
