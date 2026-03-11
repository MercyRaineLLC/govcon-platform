"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Opportunities Routes
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
const decisionEngine_1 = require("../services/decisionEngine");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
const IngestSchema = zod_1.z.object({
    naicsCode: zod_1.z.string().optional(),
    agency: zod_1.z.string().optional(),
    setAsideType: zod_1.z.string().optional(),
    limit: zod_1.z.number().int().min(1).max(100).optional().default(25),
});
const ScoreSchema = zod_1.z.object({
    clientCompanyId: zod_1.z.string().min(1),
});
function toNumber(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function buildPlainAmendmentSummary(input) {
    const text = `${input.title || ''}. ${input.description || ''}`.trim();
    if (!text)
        return 'No amendment details were provided.';
    const normalized = text.replace(/\s+/g, ' ').trim();
    const points = [];
    if (/deadline|due date|closing date|submission date/i.test(normalized)) {
        points.push('Timeline terms appear to have changed; verify the revised response deadline before submission');
    }
    if (/attach|appendix|specification|statement of work|sow/i.test(normalized)) {
        points.push('Scope or attachment references were updated; review all newly referenced files');
    }
    if (/eligib|set-?aside|sdvosb|wosb|hubzone|8\(a\)|small business/i.test(normalized)) {
        points.push('Eligibility or set-aside language is present; re-check certification alignment');
    }
    if (/wage|labor|clearance|security|background/i.test(normalized)) {
        points.push('Labor/security compliance language appears; validate staffing and compliance documentation');
    }
    const sentences = normalized
        .split(/[.!?]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => `Key update: ${s}`);
    points.push(...sentences);
    const unique = Array.from(new Set(points)).slice(0, 4);
    return unique.join(' | ');
}
// -------------------------------------------------------------
// GET /api/opportunities
// -------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const q = req.query;
        const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(q.limit || '25'), 10) || 25));
        const sortBy = String(q.sortBy || 'probability');
        const sortOrder = String(q.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
        const where = { consultingFirmId };
        // By default, hide contracts expired more than 10 days ago.
        // Pass showExpired=true to include them (e.g. for historical review).
        if (q.showExpired !== 'true') {
            const tenDaysAgo = new Date();
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
            where.responseDeadline = { gte: tenDaysAgo };
        }
        if (q.naicsCode)
            where.naicsCode = { startsWith: String(q.naicsCode) };
        if (q.agency)
            where.agency = { contains: String(q.agency), mode: 'insensitive' };
        if (q.setAsideType)
            where.setAsideType = String(q.setAsideType);
        if (q.status)
            where.status = String(q.status);
        if (q.placeOfPerformance)
            where.placeOfPerformance = { contains: String(q.placeOfPerformance), mode: 'insensitive' };
        if (q.recompeteOnly === 'true')
            where.recompeteFlag = true;
        if (q.enrichedOnly === 'true')
            where.isEnriched = true;
        const estimatedValueMin = toNumber(q.estimatedValueMin);
        const estimatedValueMax = toNumber(q.estimatedValueMax);
        if (estimatedValueMin !== undefined || estimatedValueMax !== undefined) {
            where.estimatedValue = {};
            if (estimatedValueMin !== undefined)
                where.estimatedValue.gte = estimatedValueMin;
            if (estimatedValueMax !== undefined)
                where.estimatedValue.lte = estimatedValueMax;
        }
        const probabilityMin = toNumber(q.probabilityMin);
        const probabilityMax = toNumber(q.probabilityMax);
        if (probabilityMin !== undefined || probabilityMax !== undefined) {
            where.probabilityScore = {};
            if (probabilityMin !== undefined)
                where.probabilityScore.gte = probabilityMin;
            if (probabilityMax !== undefined)
                where.probabilityScore.lte = probabilityMax;
        }
        const daysUntilDeadline = toNumber(q.daysUntilDeadline);
        if (daysUntilDeadline !== undefined) {
            const now = new Date();
            const maxDate = new Date(now.getTime() + daysUntilDeadline * 24 * 60 * 60 * 1000);
            where.responseDeadline = { gt: now, lte: maxDate };
        }
        const sortFieldMap = {
            deadline: 'responseDeadline',
            probability: 'probabilityScore',
            expectedValue: 'expectedValue',
            estimatedValue: 'estimatedValue',
            createdAt: 'createdAt',
        };
        const orderByField = sortFieldMap[sortBy] || 'probabilityScore';
        // Client fit filter: if clientId provided, restrict to NAICS codes that match client
        if (q.clientId) {
            const client = await database_1.prisma.clientCompany.findFirst({
                where: { id: String(q.clientId), consultingFirmId },
                select: { naicsCodes: true },
            });
            if (client && client.naicsCodes.length > 0) {
                // Match on 4-digit NAICS prefix for broader industry alignment
                const prefixes = Array.from(new Set(client.naicsCodes.map((c) => c.slice(0, 4))));
                where.OR = prefixes.map((prefix) => ({ naicsCode: { startsWith: prefix } }));
            }
        }
        const [opportunities, total] = await Promise.all([
            database_1.prisma.opportunity.findMany({
                where,
                orderBy: { [orderByField]: sortOrder },
                skip: (page - 1) * limit,
                take: limit,
            }),
            database_1.prisma.opportunity.count({ where }),
        ]);
        const enriched = opportunities.map((opp) => ({
            ...opp,
            deadline: (0, deadlinePriority_1.classifyDeadline)(opp.responseDeadline),
            deadlineClassification: (0, deadlinePriority_1.classifyDeadline)(opp.responseDeadline),
        }));
        res.json({
            success: true,
            data: enriched,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
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
router.get('/:id', async (req, res, next) => {
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
            throw new errors_1.NotFoundError('Opportunity not found');
        res.json({
            success: true,
            data: {
                ...opportunity,
                documents: opportunity.documents.map((doc) => ({
                    ...doc,
                    fileUrl: `/api/documents/download/${doc.id}`,
                })),
                deadline: (0, deadlinePriority_1.classifyDeadline)(opportunity.responseDeadline),
                deadlineClassification: (0, deadlinePriority_1.classifyDeadline)(opportunity.responseDeadline),
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
router.post('/ingest', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const params = IngestSchema.parse(req.body);
        logger_1.logger.info('Ingestion triggered', { consultingFirmId, params });
        const stats = await samApi_1.samApiService.searchAndIngest(params, consultingFirmId);
        const unscoredOpps = await database_1.prisma.opportunity.findMany({
            where: { consultingFirmId, isScored: false, status: 'ACTIVE' },
            select: { id: true },
            take: 500,
        });
        if (unscoredOpps.length > 0) {
            await scoringWorker_1.scoringQueue.addBulk(unscoredOpps.map((opp) => ({
                name: 'score-opportunity',
                data: { opportunityId: opp.id, consultingFirmId },
            })));
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
// POST /api/opportunities/:id/score
// -------------------------------------------------------------
router.post('/:id/score', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { clientCompanyId } = ScoreSchema.parse(req.body);
        const { id: opportunityId } = req.params;
        const [opportunity, client] = await Promise.all([
            database_1.prisma.opportunity.findFirst({ where: { id: opportunityId, consultingFirmId }, select: { id: true } }),
            database_1.prisma.clientCompany.findFirst({ where: { id: clientCompanyId, consultingFirmId, isActive: true }, select: { id: true } }),
        ]);
        if (!opportunity)
            throw new errors_1.NotFoundError('Opportunity not found');
        if (!client)
            throw new errors_1.ValidationError('clientCompanyId is required and must belong to your firm');
        const decision = await (0, decisionEngine_1.evaluateBidDecision)(opportunityId, clientCompanyId);
        res.json({ success: true, data: decision });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// GET /api/opportunities/:id/score-breakdown
// -------------------------------------------------------------
router.get('/:id/score-breakdown', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id: opportunityId } = req.params;
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id: opportunityId, consultingFirmId },
            select: {
                id: true,
                probabilityScore: true,
                expectedValue: true,
                estimatedValue: true,
                scoreBreakdown: true,
            },
        });
        if (!opportunity)
            throw new errors_1.NotFoundError('Opportunity not found');
        let breakdown = opportunity.scoreBreakdown;
        if (!breakdown) {
            const latestDecision = await database_1.prisma.bidDecision.findFirst({
                where: { opportunityId, consultingFirmId },
                orderBy: { updatedAt: 'desc' },
                select: { explanationJson: true },
            });
            const features = latestDecision?.explanationJson?.featureBreakdown || null;
            if (features) {
                const factorContributions = Object.entries(features).map(([factor, score]) => {
                    const numeric = Number(score) || 0;
                    return {
                        factor,
                        score: numeric,
                        pct: Math.round(numeric * 100),
                    };
                });
                breakdown = {
                    factorContributions,
                    generatedAt: new Date().toISOString(),
                };
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
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// POST /api/opportunities/:id/amendments/:amendmentId/interpret
// -------------------------------------------------------------
router.post('/:id/amendments/:amendmentId/interpret', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id: opportunityId, amendmentId } = req.params;
        const amendment = await database_1.prisma.amendment.findFirst({
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
        });
        if (!amendment)
            throw new errors_1.NotFoundError('Amendment not found');
        const plainLanguageSummary = buildPlainAmendmentSummary(amendment);
        const updated = await database_1.prisma.amendment.update({
            where: { id: amendment.id },
            data: {
                plainLanguageSummary,
                interpretedAt: new Date(),
            },
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// POST /api/opportunities/:id/documents
// -------------------------------------------------------------
router.post('/:id/documents', upload_1.upload.single('file'), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id } = req.params;
        const opportunity = await database_1.prisma.opportunity.findFirst({
            where: { id, consultingFirmId },
        });
        if (!opportunity)
            throw new errors_1.NotFoundError('Opportunity not found');
        if (!req.file)
            throw new errors_1.ValidationError('File required');
        const document = await database_1.prisma.opportunityDocument.create({
            data: {
                opportunityId: id,
                fileName: req.file.originalname,
                storageKey: req.file.filename,
                fileUrl: null,
                fileType: req.file.mimetype,
                fileSize: req.file.size,
                isAmendment: req.body.isAmendment === 'true',
            },
        });
        res.json({
            success: true,
            data: {
                ...document,
                fileUrl: `/api/documents/download/${document.id}`,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=opportunities.js.map