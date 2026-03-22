// =============================================================
// Jobs Routes
// POST /api/jobs/ingest
// POST /api/jobs/enrich
// POST /api/jobs/analyze/:documentId
// GET  /api/jobs
// GET  /api/jobs/:id
// =============================================================
import { Router, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../config/database';
import { authenticateJWT } from '../middleware/auth';
import { enforceTenantScope, getTenantId } from '../middleware/tenant';
import { AuthenticatedRequest } from '../types';
import { scoringQueue, enqueueAllOpportunitiesForScoring } from '../workers/scoringWorker';
import { enrichmentQueue, enqueueEnrichmentJobs } from '../workers/enrichmentWorker';
import { samApiService } from '../services/samApi';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();
router.use(authenticateJWT, enforceTenantScope);

const IngestParamsSchema = z.object({
  naicsCode: z.string().optional(),
  agency: z.string().optional(),
  setAsideType: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

// -------------------------------------------------------------
// POST /api/jobs/ingest
// -------------------------------------------------------------
router.post('/ingest', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const params = IngestParamsSchema.parse(req.body);

    // Prevent hammering SAM.gov — block if a job ran successfully in the last 5 minutes
    const recentJob = await prisma.ingestionJob.findFirst({
      where: {
        consultingFirmId,
        type: 'INGEST',
        status: 'RUNNING',
      },
    });
    if (recentJob) {
      return res.status(409).json({
        success: false,
        error: 'An ingest job is already running. Wait for it to complete before starting another.',
        data: { jobId: recentJob.id, status: 'RUNNING' },
      });
    }

    const job = await prisma.ingestionJob.create({
      data: {
        consultingFirmId,
        type: 'INGEST',
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    logger.info('Ingest job created', { jobId: job.id, consultingFirmId });

    // Return immediately — ingest runs in background
    res.json({ success: true, data: { jobId: job.id, status: 'RUNNING' } });

    setImmediate(async () => {
      try {
        const stats = await samApiService.searchAndIngest(params, consultingFirmId) as any;
        const scoringCount = await enqueueAllOpportunitiesForScoring(consultingFirmId);

        await prisma.ingestionJob.update({
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

        logger.info('Ingest job complete', { jobId: job.id });
      } catch (err) {
        const errorMsg = (err as Error).message;
        logger.error('Ingest job failed', { jobId: job.id, error: errorMsg });
        await prisma.ingestionJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', completedAt: new Date(), errorDetail: errorMsg },
        });
      }
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// POST /api/jobs/enrich
// -------------------------------------------------------------
router.post('/enrich', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);

    const running = await prisma.ingestionJob.findFirst({
      where: { consultingFirmId, type: 'ENRICH', status: 'RUNNING' },
    });

    if (running) {
      return res.json({
        success: true,
        data: { jobId: running.id, status: 'RUNNING', message: 'Enrichment already in progress' },
      });
    }

    const unenrichedCount = await prisma.opportunity.count({
      where: { consultingFirmId, status: 'ACTIVE', isEnriched: false },
    });

    if (unenrichedCount === 0) {
      return res.json({
        success: true,
        data: { jobId: null, status: 'COMPLETE', message: 'All opportunities already enriched' },
      });
    }

    const job = await prisma.ingestionJob.create({
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
        await enqueueEnrichmentJobs(consultingFirmId, job.id);

        // Poll until enrichment worker drains the queue
        const maxWait = 30 * 60 * 1000;
        const pollInterval = 15000;
        const startTime = Date.now();

        const poll = async () => {
          if (Date.now() - startTime > maxWait) {
            // Mark complete with however many were enriched — don't fail just because
            // the queue drained via timeout (batch may be legitimately done)
            const enrichedCount = await prisma.opportunity.count({
              where: { consultingFirmId, isEnriched: true },
            });
            await prisma.ingestionJob.update({
              where: { id: job.id },
              data: { status: 'COMPLETE', completedAt: new Date(), enrichedCount },
            });
            logger.info('Enrich job timed out — marking complete with current count', { jobId: job.id, enrichedCount });
            return;
          }

          // Check BullMQ queue drain instead of counting unenriched records.
          // Previously we checked isEnriched:false which never hit 0 because only
          // 500 records were queued at a time out of potentially 18k+.
          const counts = await enrichmentQueue.getJobCounts('waiting', 'active', 'delayed');
          const queueSize = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);

          if (queueSize === 0) {
            const enrichedCount = await prisma.opportunity.count({
              where: { consultingFirmId, isEnriched: true },
            });
            await prisma.ingestionJob.update({
              where: { id: job.id },
              data: { status: 'COMPLETE', completedAt: new Date(), enrichedCount },
            });
            logger.info('Enrich job complete', { jobId: job.id, enrichedCount });
          } else {
            setTimeout(poll, pollInterval);
          }
        };

        setTimeout(poll, pollInterval);
      } catch (err) {
        const errorMsg = (err as Error).message;
        await prisma.ingestionJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', completedAt: new Date(), errorDetail: errorMsg },
        });
      }
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// POST /api/jobs/analyze/:documentId
// -------------------------------------------------------------
router.post('/analyze/:documentId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const { documentId } = req.params;

    const doc = await prisma.opportunityDocument.findFirst({
      where: { id: documentId },
      include: { opportunity: true },
    });

    if (!doc || doc.opportunity.consultingFirmId !== consultingFirmId) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const job = await prisma.ingestionJob.create({
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
        const { documentAnalysisService } = await import('../services/documentAnalysis');

        await prisma.opportunityDocument.update({
          where: { id: documentId },
          data: { analysisStatus: 'RUNNING' },
        });

        const clients = await prisma.clientCompany.findMany({
          where: { consultingFirmId, isActive: true },
          select: { naicsCodes: true, sdvosb: true, wosb: true, hubzone: true, smallBusiness: true },
        });

        const clientCerts = clients.flatMap((c) => [
          c.sdvosb ? 'SDVOSB' : null,
          c.wosb ? 'WOSB' : null,
          c.hubzone ? 'HUBZone' : null,
          c.smallBusiness ? 'Small Business' : null,
        ].filter((x): x is string => x !== null));

        const documentPath = path.join(process.cwd(), 'uploads', doc.storageKey);
        if (!fs.existsSync(documentPath)) {
          throw new Error('Document file missing from storage');
        }

        const analysis = await documentAnalysisService.analyzeDocument(documentPath, {
          title: doc.opportunity.title,
          agency: doc.opportunity.agency,
          naicsCode: doc.opportunity.naicsCode,
          clientNaicsCodes: clients.flatMap((c) => c.naicsCodes),
          clientCertifications: [...new Set(clientCerts)],
        }, consultingFirmId);

        await prisma.opportunityDocument.update({
          where: { id: documentId },
          data: {
            analysisStatus: 'COMPLETE',
            scopeKeywords: analysis.scopeKeywords,
            complexityScore: analysis.complexityScore,
            alignmentScore: analysis.alignmentScore,
            incumbentSignals: analysis.incumbentSignals,
            rawAnalysis: analysis.rawAnalysis as any,
            analyzedAt: new Date(),
          },
        });

        await prisma.opportunity.update({
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
        await scoringQueue.add('score-opportunity', {
          opportunityId: doc.opportunityId,
          consultingFirmId,
        });

        await prisma.ingestionJob.update({
          where: { id: job.id },
          data: { status: 'COMPLETE', completedAt: new Date() },
        });
      } catch (err) {
        const errorMsg = (err as Error).message;
        const isNoKey = errorMsg === 'NO_LLM_KEY';
        await prisma.opportunityDocument.update({
          where: { id: documentId },
          data: {
            analysisStatus: isNoKey ? 'NO_AI_KEY' : 'FAILED',
            analysisError: isNoKey
              ? 'No AI provider key configured. Add it in Settings → AI Intelligence Provider.'
              : errorMsg,
          },
        }).catch(() => {});
        await prisma.ingestionJob.update({
          where: { id: job.id },
          data: { status: isNoKey ? 'COMPLETE' : 'FAILED', completedAt: new Date(), errorDetail: isNoKey ? null : errorMsg },
        });
      }
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/jobs
// -------------------------------------------------------------
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const jobs = await prisma.ingestionJob.findMany({
      where: { consultingFirmId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// GET /api/jobs/:id
// -------------------------------------------------------------
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const { id } = req.params;

    const job = await prisma.ingestionJob.findFirst({
      where: { id, consultingFirmId },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
});

export default router;
