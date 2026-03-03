"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Jobs Routes
// POST /api/jobs/ingest
// POST /api/jobs/enrich
// POST /api/jobs/analyze/:documentId
// GET  /api/jobs
// GET  /api/jobs/:id
// =============================================================
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const scoringWorker_1 = require("../workers/scoringWorker");
const enrichmentWorker_1 = require("../workers/enrichmentWorker");
const samApi_1 = require("../services/samApi");
const logger_1 = require("../utils/logger");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
const IngestParamsSchema = zod_1.z.object({
    naicsCode: zod_1.z.string().optional(),
    agency: zod_1.z.string().optional(),
    setAsideType: zod_1.z.string().optional(),
    limit: zod_1.z.number().int().min(1).max(100).optional().default(25),
});
// -------------------------------------------------------------
// POST /api/jobs/ingest
// -------------------------------------------------------------
router.post('/ingest', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const params = IngestParamsSchema.parse(req.body);
        const job = await database_1.prisma.ingestionJob.create({
            data: {
                consultingFirmId,
                type: 'INGEST',
                status: 'RUNNING',
                startedAt: new Date(),
            },
        });
        logger_1.logger.info('Ingest job created', { jobId: job.id, consultingFirmId });
        // Return immediately — ingest runs in background
        res.json({ success: true, data: { jobId: job.id, status: 'RUNNING' } });
        setImmediate(async () => {
            try {
                const stats = await samApi_1.samApiService.searchAndIngest(params, consultingFirmId);
                const scoringCount = await (0, scoringWorker_1.enqueueAllOpportunitiesForScoring)(consultingFirmId);
                await database_1.prisma.ingestionJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'COMPLETE',
                        completedAt: new Date(),
                        opportunitiesFound: stats.found || 0,
                        opportunitiesNew: stats.ingested || 0,
                        scoringJobsQueued: scoringCount,
                        errors: stats.errors || 0,
                    },
                });
                logger_1.logger.info('Ingest job complete', { jobId: job.id });
            }
            catch (err) {
                const errorMsg = err.message;
                logger_1.logger.error('Ingest job failed', { jobId: job.id, error: errorMsg });
                await database_1.prisma.ingestionJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', completedAt: new Date(), errorDetail: errorMsg },
                });
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// POST /api/jobs/enrich
// -------------------------------------------------------------
router.post('/enrich', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const running = await database_1.prisma.ingestionJob.findFirst({
            where: { consultingFirmId, type: 'ENRICH', status: 'RUNNING' },
        });
        if (running) {
            return res.json({
                success: true,
                data: { jobId: running.id, status: 'RUNNING', message: 'Enrichment already in progress' },
            });
        }
        const unenrichedCount = await database_1.prisma.opportunity.count({
            where: { consultingFirmId, status: 'ACTIVE', isEnriched: false },
        });
        if (unenrichedCount === 0) {
            return res.json({
                success: true,
                data: { jobId: null, status: 'COMPLETE', message: 'All opportunities already enriched' },
            });
        }
        const job = await database_1.prisma.ingestionJob.create({
            data: {
                consultingFirmId,
                type: 'ENRICH',
                status: 'RUNNING',
                startedAt: new Date(),
            },
        });
        res.json({
            success: true,
            data: { jobId: job.id, status: 'RUNNING', opportunitiesToEnrich: unenrichedCount },
        });
        setImmediate(async () => {
            try {
                await (0, enrichmentWorker_1.enqueueEnrichmentJobs)(consultingFirmId, job.id);
                // Poll until enrichment worker drains the queue
                const maxWait = 30 * 60 * 1000;
                const pollInterval = 15000;
                const startTime = Date.now();
                const poll = async () => {
                    if (Date.now() - startTime > maxWait) {
                        await database_1.prisma.ingestionJob.update({
                            where: { id: job.id },
                            data: { status: 'FAILED', completedAt: new Date(), errorDetail: 'Timeout after 30 minutes' },
                        });
                        return;
                    }
                    const remaining = await database_1.prisma.opportunity.count({
                        where: { consultingFirmId, status: 'ACTIVE', isEnriched: false },
                    });
                    if (remaining === 0) {
                        const enrichedCount = await database_1.prisma.opportunity.count({
                            where: { consultingFirmId, isEnriched: true },
                        });
                        await database_1.prisma.ingestionJob.update({
                            where: { id: job.id },
                            data: { status: 'COMPLETE', completedAt: new Date(), enrichedCount },
                        });
                        logger_1.logger.info('Enrich job complete', { jobId: job.id, enrichedCount });
                    }
                    else {
                        setTimeout(poll, pollInterval);
                    }
                };
                setTimeout(poll, pollInterval);
            }
            catch (err) {
                const errorMsg = err.message;
                await database_1.prisma.ingestionJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', completedAt: new Date(), errorDetail: errorMsg },
                });
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// POST /api/jobs/analyze/:documentId
// -------------------------------------------------------------
router.post('/analyze/:documentId', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { documentId } = req.params;
        const doc = await database_1.prisma.opportunityDocument.findFirst({
            where: { id: documentId },
            include: { opportunity: true },
        });
        if (!doc || doc.opportunity.consultingFirmId !== consultingFirmId) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        const job = await database_1.prisma.ingestionJob.create({
            data: {
                consultingFirmId,
                type: 'ANALYZE_DOCUMENT',
                status: 'RUNNING',
                startedAt: new Date(),
            },
        });
        res.json({ success: true, data: { jobId: job.id, status: 'RUNNING' } });
        setImmediate(async () => {
            try {
                const { documentAnalysisService } = await Promise.resolve().then(() => __importStar(require('../services/documentAnalysis')));
                await database_1.prisma.opportunityDocument.update({
                    where: { id: documentId },
                    data: { analysisStatus: 'RUNNING' },
                });
                const clients = await database_1.prisma.clientCompany.findMany({
                    where: { consultingFirmId, isActive: true },
                    select: { naicsCodes: true, sdvosb: true, wosb: true, hubzone: true, smallBusiness: true },
                });
                const clientCerts = clients.flatMap((c) => [
                    c.sdvosb ? 'SDVOSB' : null,
                    c.wosb ? 'WOSB' : null,
                    c.hubzone ? 'HUBZone' : null,
                    c.smallBusiness ? 'Small Business' : null,
                ].filter((x) => x !== null));
                const analysis = await documentAnalysisService.analyzeDocument(doc.storageKey, {
                    title: doc.opportunity.title,
                    agency: doc.opportunity.agency,
                    naicsCode: doc.opportunity.naicsCode,
                    clientNaicsCodes: clients.flatMap((c) => c.naicsCodes),
                    clientCertifications: [...new Set(clientCerts)],
                });
                await database_1.prisma.opportunityDocument.update({
                    where: { id: documentId },
                    data: {
                        analysisStatus: 'COMPLETE',
                        scopeKeywords: analysis.scopeKeywords,
                        complexityScore: analysis.complexityScore,
                        alignmentScore: analysis.alignmentScore,
                        incumbentSignals: analysis.incumbentSignals,
                        rawAnalysis: analysis.rawAnalysis,
                        analyzedAt: new Date(),
                    },
                });
                await database_1.prisma.opportunity.update({
                    where: { id: doc.opportunityId },
                    data: {
                        documentIntelScore: analysis.alignmentScore,
                        scopeAlignmentScore: analysis.alignmentScore,
                        technicalComplexScore: analysis.complexityScore,
                        incumbentSignalDetected: analysis.incumbentSignals.length > 0,
                        isScored: false,
                    },
                });
                // Re-score with new document signal
                await scoringWorker_1.scoringQueue.add('score-opportunity', {
                    opportunityId: doc.opportunityId,
                    consultingFirmId,
                });
                await database_1.prisma.ingestionJob.update({
                    where: { id: job.id },
                    data: { status: 'COMPLETE', completedAt: new Date() },
                });
            }
            catch (err) {
                const errorMsg = err.message;
                await database_1.prisma.opportunityDocument.update({
                    where: { id: documentId },
                    data: { analysisStatus: 'FAILED', analysisError: errorMsg },
                }).catch(() => { });
                await database_1.prisma.ingestionJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', completedAt: new Date(), errorDetail: errorMsg },
                });
            }
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// GET /api/jobs
// -------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const jobs = await database_1.prisma.ingestionJob.findMany({
            where: { consultingFirmId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json({ success: true, data: jobs });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// GET /api/jobs/:id
// -------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { id } = req.params;
        const job = await database_1.prisma.ingestionJob.findFirst({
            where: { id, consultingFirmId },
        });
        if (!job) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        res.json({ success: true, data: job });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=jobs.js.map