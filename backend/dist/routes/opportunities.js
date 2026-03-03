"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Opportunities Routes (Production Version)
// =============================================================
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const deadlinePriority_1 = require("../engines/deadlinePriority");
const samApi_1 = require("../services/samApi");
const scoringWorker_1 = require("../workers/scoringWorker");
const portfolioDecisionEngine_1 = require("../services/portfolioDecisionEngine");
const upload_1 = require("../middleware/upload");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
// -------------------------------------------------------------
// Validation Schemas
// -------------------------------------------------------------
const SearchSchema = zod_1.z.object({
    naicsCode: zod_1.z.string().optional(),
    agency: zod_1.z.string().optional(),
    marketCategory: zod_1.z.string().optional(),
    setAsideType: zod_1.z.string().optional(),
    estimatedValueMin: zod_1.z.coerce.number().optional(),
    estimatedValueMax: zod_1.z.coerce.number().optional(),
    daysUntilDeadline: zod_1.z.coerce.number().int().positive().optional(),
    probabilityMin: zod_1.z.coerce.number().min(0).max(1).optional(),
    probabilityMax: zod_1.z.coerce.number().min(0).max(1).optional(),
    status: zod_1.z.enum(["ACTIVE", "AWARDED", "CANCELLED", "ARCHIVED"]).optional().default("ACTIVE"),
    sortBy: zod_1.z.enum(["deadline", "probability", "expectedValue", "createdAt"]).optional().default("deadline"),
    sortOrder: zod_1.z.enum(["asc", "desc"]).optional().default("asc"),
    page: zod_1.z.coerce.number().int().positive().optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional().default(25),
});
const IngestSchema = zod_1.z.object({
    naicsCode: zod_1.z.string().optional(),
    agency: zod_1.z.string().optional(),
    setAsideType: zod_1.z.string().optional(),
    limit: zod_1.z.number().int().min(1).max(100).optional().default(25),
});
// -------------------------------------------------------------
// GET /api/opportunities
// -------------------------------------------------------------
router.get("/", async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const params = SearchSchema.parse(req.query);
        const { page, limit, sortBy, sortOrder } = params;
        const skip = (page - 1) * limit;
        const where = { consultingFirmId, status: params.status };
        if (params.naicsCode)
            where.naicsCode = { contains: params.naicsCode };
        if (params.agency)
            where.agency = { contains: params.agency, mode: "insensitive" };
        if (params.marketCategory)
            where.marketCategory = params.marketCategory;
        if (params.setAsideType)
            where.setAsideType = params.setAsideType;
        if (params.probabilityMin != null || params.probabilityMax != null) {
            where.probabilityScore = {};
            if (params.probabilityMin != null)
                where.probabilityScore.gte = params.probabilityMin;
            if (params.probabilityMax != null)
                where.probabilityScore.lte = params.probabilityMax;
        }
        const orderByMap = {
            deadline: { responseDeadline: sortOrder },
            probability: { probabilityScore: sortOrder },
            expectedValue: { expectedValue: sortOrder },
            createdAt: { createdAt: sortOrder },
        };
        const [opportunities, total] = await Promise.all([
            database_1.prisma.opportunity.findMany({
                where,
                orderBy: orderByMap[sortBy],
                skip,
                take: limit,
            }),
            database_1.prisma.opportunity.count({ where }),
        ]);
        const enriched = opportunities.map((opp) => ({
            ...opp,
            deadline: (0, deadlinePriority_1.classifyDeadline)(opp.responseDeadline),
        }));
        res.json({
            success: true,
            data: enriched,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// POST /api/opportunities/ingest
// -------------------------------------------------------------
router.post("/ingest", async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const params = IngestSchema.parse(req.body);
        logger_1.logger.info("SAM.gov ingestion triggered", { consultingFirmId, params });
        const stats = await samApi_1.samApiService.searchAndIngest(params, consultingFirmId);
        const unscoredOpps = await database_1.prisma.opportunity.findMany({
            where: {
                consultingFirmId,
                status: "ACTIVE",
                isScored: false,
            },
            select: { id: true },
            take: 200,
        });
        for (const opp of unscoredOpps) {
            await scoringWorker_1.scoringQueue.add("score-opportunity", {
                opportunityId: opp.id,
                consultingFirmId,
            });
        }
        await (0, portfolioDecisionEngine_1.runPortfolioEvaluation)(consultingFirmId);
        await database_1.prisma.consultingFirm.update({
            where: { id: consultingFirmId },
            data: { lastIngestedAt: new Date() },
        });
        res.json({
            success: true,
            data: {
                ...stats,
                scoringJobsQueued: unscoredOpps.length,
                portfolioDecisionEvaluated: true,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// GET /api/opportunities/:id
// -------------------------------------------------------------
router.get("/:id", async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id } = req.params;
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id, consultingFirmId },
            include: {
                documents: true,
            },
        });
        if (!opportunity) {
            throw new errors_1.NotFoundError("Opportunity not found");
        }
        const enriched = {
            ...opportunity,
            deadlineClassification: (0, deadlinePriority_1.classifyDeadline)(opportunity.responseDeadline),
        };
        res.json({
            success: true,
            data: enriched,
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// POST /api/opportunities/:id/documents
// -------------------------------------------------------------
router.post("/:id/documents", upload_1.upload.single("file"), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id } = req.params;
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id, consultingFirmId },
        });
        if (!opportunity) {
            throw new errors_1.NotFoundError("Opportunity not found");
        }
        if (!req.file) {
            throw new errors_1.ValidationError("File is required");
        }
        const document = await database_1.prisma.opportunityDocument.create({
            data: {
                opportunityId: id,
                fileName: req.file.originalname,
                fileUrl: `/uploads/${req.file.filename}`,
                fileType: req.file.mimetype,
                isAmendment: req.body.isAmendment === "true",
            },
        });
        res.json({
            success: true,
            data: document,
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=opportunities.js.map