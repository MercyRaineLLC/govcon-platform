// =============================================================
// Opportunities Routes
// =============================================================
import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../config/database'
import { authenticateJWT } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { AuthenticatedRequest } from '../types'
import { NotFoundError, ValidationError } from '../utils/errors'
import { classifyDeadline } from '../engines/deadlinePriority'
import { samApiService } from '../services/samApi'
import { scoringQueue } from '../workers/scoringWorker'
import { runPortfolioEvaluation } from '../services/portfolioDecisionEngine'
import { upload } from '../middleware/upload'
import { logger } from '../utils/logger'
import { evaluateBidDecision } from '../services/decisionEngine'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

const IngestSchema = z.object({
  naicsCode: z.string().optional(),
  agency: z.string().optional(),
  setAsideType: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
})

const ScoreSchema = z.object({
  clientCompanyId: z.string().min(1),
})

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildPlainAmendmentSummary(input: { title?: string | null; description?: string | null }): string {
  const text = `${input.title || ''}. ${input.description || ''}`.trim()
  if (!text) return 'No amendment details were provided.'

  const normalized = text.replace(/\s+/g, ' ').trim()
  const points: string[] = []

  if (/deadline|due date|closing date|submission date/i.test(normalized)) {
    points.push('Timeline terms appear to have changed; verify the revised response deadline before submission')
  }
  if (/attach|appendix|specification|statement of work|sow/i.test(normalized)) {
    points.push('Scope or attachment references were updated; review all newly referenced files')
  }
  if (/eligib|set-?aside|sdvosb|wosb|hubzone|8\(a\)|small business/i.test(normalized)) {
    points.push('Eligibility or set-aside language is present; re-check certification alignment')
  }
  if (/wage|labor|clearance|security|background/i.test(normalized)) {
    points.push('Labor/security compliance language appears; validate staffing and compliance documentation')
  }

  const sentences = normalized
    .split(/[.!?]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => `Key update: ${s}`)

  points.push(...sentences)

  const unique = Array.from(new Set(points)).slice(0, 4)
  return unique.join(' | ')
}

// -------------------------------------------------------------
// GET /api/opportunities
// -------------------------------------------------------------
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const q = req.query

    const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(String(q.limit || '25'), 10) || 25))
    const sortBy = String(q.sortBy || 'probability')
    const sortOrder = String(q.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'

    const where: any = { consultingFirmId }

    // By default, hide contracts expired more than 10 days ago.
    // Pass showExpired=true to include them (e.g. for historical review).
    if (q.showExpired !== 'true') {
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      where.responseDeadline = { gte: tenDaysAgo }
    }

    if (q.naicsCode) where.naicsCode = { startsWith: String(q.naicsCode) }
    if (q.agency) where.agency = { contains: String(q.agency), mode: 'insensitive' }
    if (q.setAsideType) where.setAsideType = String(q.setAsideType)
    if (q.status) where.status = String(q.status)
    if (q.placeOfPerformance) where.placeOfPerformance = { contains: String(q.placeOfPerformance), mode: 'insensitive' }
    if (q.recompeteOnly === 'true') where.recompeteFlag = true
    if (q.enrichedOnly === 'true') where.isEnriched = true

    const estimatedValueMin = toNumber(q.estimatedValueMin)
    const estimatedValueMax = toNumber(q.estimatedValueMax)
    if (estimatedValueMin !== undefined || estimatedValueMax !== undefined) {
      where.estimatedValue = {}
      if (estimatedValueMin !== undefined) where.estimatedValue.gte = estimatedValueMin
      if (estimatedValueMax !== undefined) where.estimatedValue.lte = estimatedValueMax
    }

    const probabilityMin = toNumber(q.probabilityMin)
    const probabilityMax = toNumber(q.probabilityMax)
    if (probabilityMin !== undefined || probabilityMax !== undefined) {
      where.probabilityScore = {}
      if (probabilityMin !== undefined) where.probabilityScore.gte = probabilityMin
      if (probabilityMax !== undefined) where.probabilityScore.lte = probabilityMax
    }

    const daysUntilDeadline = toNumber(q.daysUntilDeadline)
    if (daysUntilDeadline !== undefined) {
      const now = new Date()
      const maxDate = new Date(now.getTime() + daysUntilDeadline * 24 * 60 * 60 * 1000)
      where.responseDeadline = { gt: now, lte: maxDate }
    }

    const sortFieldMap: Record<string, string> = {
      deadline: 'responseDeadline',
      probability: 'probabilityScore',
      expectedValue: 'expectedValue',
      estimatedValue: 'estimatedValue',
      createdAt: 'createdAt',
    }
    const orderByField = sortFieldMap[sortBy] || 'probabilityScore'

    // Client fit filter: if clientId provided, restrict to NAICS codes that match client
    if (q.clientId) {
      const client = await prisma.clientCompany.findFirst({
        where: { id: String(q.clientId), consultingFirmId },
        select: { naicsCodes: true },
      })
      if (client && client.naicsCodes.length > 0) {
        // Match on 4-digit NAICS prefix for broader industry alignment
        const prefixes = Array.from(new Set(client.naicsCodes.map((c: string) => c.slice(0, 4))))
        where.OR = prefixes.map((prefix: string) => ({ naicsCode: { startsWith: prefix } }))
      }
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        orderBy: { [orderByField]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.opportunity.count({ where }),
    ])

    const enriched = opportunities.map((opp) => ({
      ...opp,
      deadline: classifyDeadline(opp.responseDeadline),
      deadlineClassification: classifyDeadline(opp.responseDeadline),
    }))

    res.json({
      success: true,
      data: enriched,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// GET /api/opportunities/:id
// -------------------------------------------------------------
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { id } = req.params

    const opportunity = await prisma.opportunity.findFirst({
      where: { id, consultingFirmId },
      include: {
        documents: true,
        amendments: true,
        awardHistory: true,
      },
    })

    if (!opportunity) throw new NotFoundError('Opportunity not found')

    res.json({
      success: true,
      data: {
        ...opportunity,
        documents: opportunity.documents.map((doc) => ({
          ...doc,
          fileUrl: `/api/documents/download/${doc.id}`,
        })),
        deadline: classifyDeadline(opportunity.responseDeadline),
        deadlineClassification: classifyDeadline(opportunity.responseDeadline),
      },
    })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// POST /api/opportunities/ingest
// -------------------------------------------------------------
router.post('/ingest', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const params = IngestSchema.parse(req.body)

    logger.info('Ingestion triggered', { consultingFirmId, params })

    const stats = await samApiService.searchAndIngest(params, consultingFirmId)

    const unscoredOpps = await prisma.opportunity.findMany({
      where: { consultingFirmId, isScored: false, status: 'ACTIVE' },
      select: { id: true },
      take: 500,
    })

    if (unscoredOpps.length > 0) {
      await scoringQueue.addBulk(
        unscoredOpps.map((opp) => ({
          name: 'score-opportunity',
          data: { opportunityId: opp.id, consultingFirmId },
        }))
      )
    }

    await runPortfolioEvaluation(consultingFirmId)

    await prisma.consultingFirm.update({
      where: { id: consultingFirmId },
      data: { lastIngestedAt: new Date() },
    })

    res.json({
      success: true,
      data: {
        ...stats,
        scoringJobsQueued: unscoredOpps.length,
      },
    })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// POST /api/opportunities/:id/score
// -------------------------------------------------------------
router.post('/:id/score', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { clientCompanyId } = ScoreSchema.parse(req.body)
    const { id: opportunityId } = req.params

    const [opportunity, client] = await Promise.all([
      prisma.opportunity.findFirst({ where: { id: opportunityId, consultingFirmId }, select: { id: true } }),
      prisma.clientCompany.findFirst({ where: { id: clientCompanyId, consultingFirmId, isActive: true }, select: { id: true } }),
    ])

    if (!opportunity) throw new NotFoundError('Opportunity not found')
    if (!client) throw new ValidationError('clientCompanyId is required and must belong to your firm')

    const decision = await evaluateBidDecision(opportunityId, clientCompanyId)
    res.json({ success: true, data: decision })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// GET /api/opportunities/:id/score-breakdown
// -------------------------------------------------------------
router.get('/:id/score-breakdown', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { id: opportunityId } = req.params

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: opportunityId, consultingFirmId },
      select: {
        id: true,
        probabilityScore: true,
        expectedValue: true,
        estimatedValue: true,
        scoreBreakdown: true,
      },
    })

    if (!opportunity) throw new NotFoundError('Opportunity not found')

    let breakdown = opportunity.scoreBreakdown as any

    if (!breakdown) {
      const latestDecision = await prisma.bidDecision.findFirst({
        where: { opportunityId, consultingFirmId },
        orderBy: { updatedAt: 'desc' },
        select: { explanationJson: true },
      })

      const features = (latestDecision?.explanationJson as any)?.featureBreakdown || null
      if (features) {
        const factorContributions = Object.entries(features).map(([factor, score]) => {
          const numeric = Number(score) || 0
          return {
            factor,
            score: numeric,
            pct: Math.round(numeric * 100),
          }
        })

        breakdown = {
          factorContributions,
          generatedAt: new Date().toISOString(),
        }
      }
    }

    res.json({
      success: true,
      data: {
        probability: opportunity.probabilityScore,
        expectedValue: Number(opportunity.expectedValue || 0),
        estimatedValue: Number(opportunity.estimatedValue || 0),
        breakdown,
      },
    })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// POST /api/opportunities/:id/amendments/:amendmentId/interpret
// -------------------------------------------------------------
router.post('/:id/amendments/:amendmentId/interpret', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { id: opportunityId, amendmentId } = req.params

    const amendment = await prisma.amendment.findFirst({
      where: {
        id: amendmentId,
        opportunityId,
        opportunity: { consultingFirmId },
      },
      select: {
        id: true,
        title: true,
        description: true,
      },
    })
    if (!amendment) throw new NotFoundError('Amendment not found')

    const plainLanguageSummary = buildPlainAmendmentSummary(amendment)
    const updated = await prisma.amendment.update({
      where: { id: amendment.id },
      data: {
        plainLanguageSummary,
        interpretedAt: new Date(),
      },
    })

    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// POST /api/opportunities/:id/documents
// -------------------------------------------------------------
router.post(
  '/:id/documents',
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)
      const { id } = req.params

      const opportunity = await prisma.opportunity.findFirst({
        where: { id, consultingFirmId },
      })

      if (!opportunity) throw new NotFoundError('Opportunity not found')
      if (!req.file) throw new ValidationError('File required')

      const document = await prisma.opportunityDocument.create({
        data: {
          opportunityId: id,
          fileName: req.file.originalname,
          storageKey: req.file.filename,
          fileUrl: null,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
          isAmendment: req.body.isAmendment === 'true',
        },
      })

      res.json({
        success: true,
        data: {
          ...document,
          fileUrl: `/api/documents/download/${document.id}`,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
