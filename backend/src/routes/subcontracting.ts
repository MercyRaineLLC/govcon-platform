// =============================================================
// Subcontracting Opportunities Route
// Aggregates SUBNet + USAspending + SAM.gov set-aside data
// =============================================================
import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { logger } from '../utils/logger'
import { scrapeUsaSpendingSubcontracts, scrapeSamSubcontracting } from '../services/subnetScraper'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// =============================================================
// GET /api/subcontracting/opportunities
// =============================================================
router.get('/opportunities', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { search, naicsCode, setAside, limit = '50', offset = '0' } = req.query as Record<string, string>

    const where: Record<string, unknown> = { consultingFirmId }
    if (naicsCode) where.naicsCode = naicsCode
    if (setAside)  where.setAside  = setAside
    if (search)    where.title     = { contains: search, mode: 'insensitive' }

    const [opportunities, total] = await Promise.all([
      prisma.subcontractOpportunity.findMany({
        where,
        orderBy: { scrapedAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.subcontractOpportunity.count({ where }),
    ])

    res.json({ success: true, data: { opportunities, total } })
  } catch (err) { next(err) }
})

// =============================================================
// GET /api/subcontracting/stats
// =============================================================
router.get('/stats', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const [total, bySetAside, open] = await Promise.all([
      prisma.subcontractOpportunity.count({ where: { consultingFirmId } }),
      prisma.subcontractOpportunity.groupBy({
        by: ['setAside'],
        where: { consultingFirmId },
        _count: { _all: true },
        orderBy: { _count: { setAside: 'desc' } },
      }),
      prisma.subcontractOpportunity.count({ where: { consultingFirmId, status: 'OPEN' } }),
    ])
    res.json({ success: true, data: { total, bySetAside, open } })
  } catch (err) { next(err) }
})

// =============================================================
// POST /api/subcontracting/sync
// Trigger scrape from USAspending + SAM.gov
// =============================================================
router.post('/sync', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    res.json({ success: true, message: 'Subcontracting sync started. Pulling from SUBNet, USAspending, and SAM.gov set-asides.' })

    setImmediate(async () => {
      try {
        // Get client NAICS codes + firm SAM key
        const [clients, firm] = await Promise.all([
          prisma.clientCompany.findMany({
            where: { consultingFirmId, isActive: true },
            select: { naicsCodes: true },
          }),
          prisma.consultingFirm.findUnique({
            where: { id: consultingFirmId },
            select: { samApiKey: true },
          }),
        ])

        const naicsCodes = [...new Set(clients.flatMap((c) => c.naicsCodes))]

        // Pull from both sources in parallel
        const [usaResults, samResults] = await Promise.all([
          scrapeUsaSpendingSubcontracts(naicsCodes.length > 0 ? naicsCodes : undefined),
          firm?.samApiKey ? scrapeSamSubcontracting(firm.samApiKey) : Promise.resolve([]),
        ])

        const allOpps = [...usaResults, ...samResults]
        let created = 0
        let skipped = 0

        for (const opp of allOpps) {
          try {
            await prisma.subcontractOpportunity.upsert({
              where: { externalId: opp.externalId },
              update: {
                title:             opp.title,
                estimatedValue:    opp.estimatedValue ?? undefined,
                responseDeadline:  opp.responseDeadline ?? undefined,
                description:       opp.description ?? undefined,
                scrapedAt:         new Date(),
              },
              create: {
                consultingFirmId,
                externalId:         opp.externalId,
                title:              opp.title,
                primeContractor:    opp.primeContractor,
                primeContractorUei: opp.primeContractorUei ?? undefined,
                naicsCode:          opp.naicsCode ?? undefined,
                agency:             opp.agency ?? undefined,
                estimatedValue:     opp.estimatedValue ?? undefined,
                responseDeadline:   opp.responseDeadline ?? undefined,
                description:        opp.description ?? undefined,
                contactEmail:       opp.contactEmail ?? undefined,
                contactName:        opp.contactName ?? undefined,
                sourceUrl:          opp.sourceUrl ?? undefined,
                setAside:           opp.setAside ?? undefined,
                status:             'OPEN',
              },
            })
            created++
          } catch {
            skipped++
          }
        }

        logger.info('Subcontracting sync complete', { consultingFirmId, total: allOpps.length, created, skipped })
      } catch (err) {
        logger.error('Subcontracting sync failed', { error: (err as Error).message })
      }
    })
  } catch (err) { next(err) }
})

// =============================================================
// POST /api/subcontracting/opportunities  (manual add)
// =============================================================
router.post('/opportunities', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { title, primeContractor, naicsCode, agency, estimatedValue,
            responseDeadline, description, contactEmail, contactName, sourceUrl, setAside } = req.body

    if (!title || !primeContractor) {
      return res.status(400).json({ success: false, error: 'title and primeContractor are required' })
    }

    const opp = await prisma.subcontractOpportunity.create({
      data: {
        consultingFirmId,
        title,
        primeContractor,
        naicsCode:        naicsCode        ?? undefined,
        agency:           agency           ?? undefined,
        estimatedValue:   estimatedValue   ? parseFloat(estimatedValue) : undefined,
        responseDeadline: responseDeadline ? new Date(responseDeadline) : undefined,
        description:      description      ?? undefined,
        contactEmail:     contactEmail     ?? undefined,
        contactName:      contactName      ?? undefined,
        sourceUrl:        sourceUrl        ?? undefined,
        setAside:         setAside         ?? undefined,
        status:           'OPEN',
      },
    })
    res.status(201).json({ success: true, data: opp })
  } catch (err) { next(err) }
})

// =============================================================
// DELETE /api/subcontracting/opportunities/:id
// =============================================================
router.delete('/opportunities/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const existing = await prisma.subcontractOpportunity.findFirst({
      where: { id: req.params.id, consultingFirmId },
    })
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' })
    await prisma.subcontractOpportunity.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
