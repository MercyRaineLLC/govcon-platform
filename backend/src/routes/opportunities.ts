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
// GET ALL OPPORTUNITIES
// -------------------------------------------------------------
router.get("/", async (req: AuthenticatedRequest, res, next) => {
  try {
    const consultingFirmId = getTenantId(req)

    const opportunities = await prisma.opportunity.findMany({
      where: { consultingFirmId },
      orderBy: { responseDeadline: "asc" },
    })

    const enriched = opportunities.map((opp) => ({
      ...opp,
      deadlineClassification: classifyDeadline(opp.responseDeadline),
    }))

    res.json({ success: true, data: enriched })
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
        deadlineClassification: classifyDeadline(opportunity.responseDeadline),
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
          fileUrl: `/uploads/${req.file.filename}`,
          fileType: req.file.mimetype,
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