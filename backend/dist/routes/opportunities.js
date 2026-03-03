"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Opportunities Routes - Stable Demo Version
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
// INGEST VALIDATION
// -------------------------------------------------------------
const IngestSchema = zod_1.z.object({
    naicsCode: zod_1.z.string().optional(),
    agency: zod_1.z.string().optional(),
    setAsideType: zod_1.z.string().optional(),
    limit: zod_1.z.number().int().min(1).max(100).optional().default(25),
});
// -------------------------------------------------------------
// GET ALL OPPORTUNITIES
// -------------------------------------------------------------
router.get("/", async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const opportunities = await database_1.prisma.opportunity.findMany({
            where: { consultingFirmId },
            orderBy: { responseDeadline: "asc" },
        });
        const enriched = opportunities.map((opp) => ({
            ...opp,
            deadlineClassification: (0, deadlinePriority_1.classifyDeadline)(opp.responseDeadline),
        }));
        res.json({ success: true, data: enriched });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// GET SINGLE OPPORTUNITY
// -------------------------------------------------------------
router.get("/:id", async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id } = req.params;
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id, consultingFirmId },
            include: {
                documents: true,
                amendments: true,
                awardHistory: true,
            },
        });
        if (!opportunity)
            throw new errors_1.NotFoundError("Opportunity not found");
        res.json({
            success: true,
            data: {
                ...opportunity,
                deadlineClassification: (0, deadlinePriority_1.classifyDeadline)(opportunity.responseDeadline),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// INGEST
// -------------------------------------------------------------
router.post("/ingest", async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const params = IngestSchema.parse(req.body);
        logger_1.logger.info("Ingestion triggered", { consultingFirmId, params });
        const stats = await samApi_1.samApiService.searchAndIngest(params, consultingFirmId);
        const unscoredOpps = await database_1.prisma.opportunity.findMany({
            where: { consultingFirmId, isScored: false },
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
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// DOCUMENT UPLOAD
// -------------------------------------------------------------
router.post("/:id/documents", upload_1.upload.single("file"), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id } = req.params;
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id, consultingFirmId },
        });
        if (!opportunity)
            throw new errors_1.NotFoundError("Opportunity not found");
        if (!req.file)
            throw new errors_1.ValidationError("File required");
        const document = await database_1.prisma.opportunityDocument.create({
            data: {
                opportunityId: id,
                fileName: req.file.originalname,
                fileUrl: `/uploads/${req.file.filename}`,
                fileType: req.file.mimetype,
                isAmendment: req.body.isAmendment === "true",
            },
        });
        res.json({ success: true, data: document });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=opportunities.js.map