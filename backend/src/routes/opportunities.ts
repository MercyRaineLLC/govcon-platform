// =============================================================
// Opportunities Routes - Stable Demo Version
// =============================================================
import { Router, Response, NextFunction } from "express"
import { z } from "zod"
import { prisma } from "../config/database"
import { authenticateJWT } from "../middleware/auth"
import { enforceTenantScope, getTenantId } from "../middleware/tenant"
import { AuthenticatedRequest } from "../types"
import { NotFoundError, ValidationError } from "../utils/errors"
import { classifyDeadline } from "../engines/deadlinePriority"
import { samApiService } from "../services/samApi"
import { scoringQueue } from "../workers/scoringWorker"
import { runPortfolioEvaluation } from "../services/portfolioDecisionEngine"
import { upload } from "../middleware/upload"
import { logger } from "../utils/logger"

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// -------------------------------------------------------------
// INGEST VALIDATION
// -------------------------------------------------------------
const IngestSchema = z.object({
  naicsCode: z.string().optional(),
  agency: z.string().optional(),
  setAsideType: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
})

// -------------------------------------------------------------
// GET ALL OPPORTUNITIES (with filtering, sorting, pagination)
// -------------------------------------------------------------
router.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const skip = (page - 1) * limit

    // Build where clause from filters
    const where: any = { consultingFirmId }
    if (req.query.naicsCode) where.naicsCode = { contains: req.query.naicsCode as string }
    if (req.query.agency) where.agency = { contains: req.query.agency as string, mode: 'insensitive' }
    if (req.query.setAsideType) where.setAsideType = req.query.setAsideType as string
    if (req.query.daysUntilDeadline) {
      const maxDays = parseInt(req.query.daysUntilDeadline as string)
      if (!isNaN(maxDays)) {
        const maxDate = new Date()
        maxDate.setDate(maxDate.getDate() + maxDays)
        where.responseDeadline = { lte: maxDate, gte: new Date() }
      }
    }

    // Build orderBy from sort params
    const sortBy = (req.query.sortBy as string) || 'probability'
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc'
    const orderByMap: Record<string, any> = {
      probability: { probabilityScore: sortOrder },
      deadline: { responseDeadline: sortOrder === 'desc' ? 'asc' : 'desc' },
      expectedValue: { expectedValue: sortOrder },
      createdAt: { createdAt: sortOrder },
    }
    const orderBy = orderByMap[sortBy] || { probabilityScore: 'desc' }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({ where, orderBy, skip, take: limit }),
      prisma.opportunity.count({ where }),
    ])

    const enriched = opportunities.map((opp) => {
      const deadline = classifyDeadline(opp.responseDeadline)
      return { ...opp, deadline }
    })

    res.json({
      success: true,
      data: enriched,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// GET SINGLE OPPORTUNITY
// -------------------------------------------------------------
router.get("/:id", async (req: AuthenticatedRequest, res, next) => {
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

    if (!opportunity) throw new NotFoundError("Opportunity not found")

    res.json({
      success: true,
      data: {
        ...opportunity,
        deadline: classifyDeadline(opportunity.responseDeadline),
      },
    })
  } catch (err) {
    next(err)
  }
})

// -------------------------------------------------------------
// INGEST
// -------------------------------------------------------------
router.post("/ingest", async (req: AuthenticatedRequest, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)
    const params = IngestSchema.parse(req.body)

    logger.info("Ingestion triggered", { consultingFirmId, params })

    const stats = await samApiService.searchAndIngest(params, consultingFirmId)

    const unscoredOpps = await prisma.opportunity.findMany({
      where: { consultingFirmId, isScored: false },
      select: { id: true },
      take: 200,
    })

    for (const opp of unscoredOpps) {
      await scoringQueue.add("score-opportunity", {
        opportunityId: opp.id,
        consultingFirmId,
      })
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
// DOCUMENT UPLOAD
// -------------------------------------------------------------
router.post(
  "/:id/documents",
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const consultingFirmId = getTenantId(req)
      const { id } = req.params

      const opportunity = await prisma.opportunity.findFirst({
        where: { id, consultingFirmId },
      })

      if (!opportunity) throw new NotFoundError("Opportunity not found")
      if (!req.file) throw new ValidationError("File required")

      const document = await prisma.opportunityDocument.create({
        data: {
          opportunityId: id,
          fileName: req.file.originalname,
          storageKey: req.file.filename,
          fileUrl: `/uploads/${req.file.filename}`,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
          isAmendment: req.body.isAmendment === "true",
        },
      })

      res.json({ success: true, data: document })
    } catch (err) {
      next(err)
    }
  }
)

export default router
