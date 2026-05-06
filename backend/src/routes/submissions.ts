// =============================================================
// Submission Records Routes
// =============================================================
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticateJWT } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { enforceTenantScope, getTenantId } from '../middleware/tenant';
import { AuthenticatedRequest } from '../types';
import { NotFoundError, ValidationError } from '../utils/errors';
import { evaluateOnTime, enforceAndLogPenalty } from '../engines/penaltyEngine';
import { recalculateClientStats } from '../services/performanceStats';
import {
  isSubmissionBlocked,
  transitionSubmissionStatus,
  isValidTransition,
  ComplianceStatus,
} from '../services/complianceStateMachine';
import { logger } from '../utils/logger';
import { logAudit } from '../services/auditService';

const router = Router();
router.use(authenticateJWT, enforceTenantScope);

const CreateSubmissionSchema = z.object({
  clientCompanyId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  submittedAt: z.string().datetime().transform((s) => new Date(s)),
  notes: z.string().optional(),
});

const StatusTransitionSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'BLOCKED', 'REJECTED']),
  reason: z.string().optional(),
});

/**
 * POST /api/submissions
 */
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const body = CreateSubmissionSchema.parse(req.body);

    const [client, opportunity] = await Promise.all([
      prisma.clientCompany.findFirst({
        where: { id: body.clientCompanyId, consultingFirmId },
      }),
      prisma.opportunity.findFirst({
        where: { id: body.opportunityId, consultingFirmId },
        select: { id: true, responseDeadline: true, estimatedValue: true, title: true },
      }),
    ]);

    if (!client) throw new NotFoundError('ClientCompany');
    if (!opportunity) throw new NotFoundError('Opportunity');

    // Compliance gate: reject if the BidDecision for this pair is BLOCKED
    const gate = await isSubmissionBlocked(body.opportunityId, body.clientCompanyId);
    if (gate.blocked) {
      return res.status(422).json({
        success: false,
        error: 'Submission blocked by compliance review',
        code: 'COMPLIANCE_BLOCKED',
        detail: gate.reason,
      });
    }

    const wasOnTime = evaluateOnTime(body.submittedAt, opportunity.responseDeadline);

    const submission = await prisma.$transaction(async (tx) => {
      const record = await tx.submissionRecord.create({
        data: {
          consultingFirmId,
          clientCompanyId: body.clientCompanyId,
          opportunityId: body.opportunityId,
          submittedById: req.user?.userId || '',
          submittedAt: body.submittedAt,
          wasOnTime,
          penaltyAmount: 0,
          notes: body.notes,
          status: 'PENDING',
        },
      });

      if (!wasOnTime) {
        const penaltyResult = await enforceAndLogPenalty({
          consultingFirmId,
          clientCompanyId: body.clientCompanyId,
          submissionRecordId: record.id,
          estimatedValue: opportunity.estimatedValue ? Number(opportunity.estimatedValue) : null,
        });

        if (penaltyResult.amount > 0) {
          await tx.submissionRecord.update({
            where: { id: record.id },
            data: { penaltyAmount: penaltyResult.amount },
          });
          return { ...record, penaltyAmount: penaltyResult.amount };
        }
      }

      return record;
    });

    recalculateClientStats(body.clientCompanyId, consultingFirmId).catch((err) => {
      logger.error('Stats recalculation failed', { error: err });
    });

    logger.info('Submission logged', {
      submissionId: submission.id,
      wasOnTime,
      penaltyAmount: submission.penaltyAmount,
    });

    res.status(201).json({
      success: true,
      data: {
        ...submission,
        wasOnTime,
        lateMessage: !wasOnTime
          ? `Submission was ${Math.ceil(
              (body.submittedAt.getTime() - opportunity.responseDeadline.getTime()) /
                (1000 * 60 * 60 * 24)
            )} day(s) late`
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions
 */
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const { clientCompanyId, opportunityId, wasOnTime, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = { consultingFirmId };
    if (clientCompanyId) where.clientCompanyId = clientCompanyId;
    if (opportunityId) where.opportunityId = opportunityId;
    if (wasOnTime !== undefined) where.wasOnTime = wasOnTime === 'true';

    const [submissions, total] = await Promise.all([
      prisma.submissionRecord.findMany({
        where,
        include: {
          clientCompany: { select: { id: true, name: true } },
          opportunity: {
            select: { id: true, title: true, agency: true, responseDeadline: true },
          },
          submittedBy: { select: { id: true, firstName: true, lastName: true } },
          financialPenalties: true,
        },
        orderBy: { submittedAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.submissionRecord.count({ where }),
    ]);

    res.json({
      success: true,
      data: submissions,
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions/:id
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const submission = await prisma.submissionRecord.findFirst({
      where: { id: req.params.id, consultingFirmId },
      include: {
        clientCompany: true,
        opportunity: true,
        submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        financialPenalties: true,
      },
    });

    if (!submission) throw new NotFoundError('SubmissionRecord');
    res.json({ success: true, data: submission });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/submissions/:id/status  (ADMIN only)
 * Manually transition a submission's compliance status.
 */
router.patch(
  '/:id/status',
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req);
      const { status, reason } = StatusTransitionSchema.parse(req.body);

      const result = await transitionSubmissionStatus({
        submissionId: req.params.id,
        toStatus: status as ComplianceStatus,
        consultingFirmId,
        triggeredBy: req.user?.userId,
        reason,
      });

      if (!result.success) {
        return res.status(422).json({
          success: false,
          error: result.error,
          code: 'INVALID_TRANSITION',
        });
      }

      res.json({ success: true, data: { id: req.params.id, status } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/submissions/:id/outcome  (ADMIN only)
 * Record the post-evaluation result of a submission. Drives win-rate
 * KPIs and provides labels for the calibration backtest's real-bid
 * source. Idempotent — re-recording overwrites prior outcome.
 */
const OutcomeSchema = z.object({
  outcome: z.enum(['WON', 'LOST', 'NO_AWARD', 'WITHDRAWN']),
  notes: z.string().max(2000).optional(),
});

router.patch(
  '/:id/outcome',
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req);
      const { outcome, notes } = OutcomeSchema.parse(req.body);

      const submission = await prisma.submissionRecord.findFirst({
        where: { id: req.params.id, consultingFirmId },
        select: { id: true, clientCompanyId: true, outcome: true },
      });
      if (!submission) throw new NotFoundError('Submission record');

      const updated = await prisma.submissionRecord.update({
        where: { id: req.params.id },
        data: {
          outcome,
          outcomeRecordedAt: new Date(),
          outcomeNotes: notes ?? null,
        },
        select: { id: true, outcome: true, outcomeRecordedAt: true, clientCompanyId: true },
      });

      void logAudit({
        consultingFirmId,
        actorUserId: req.user?.userId ?? null,
        action: 'UPDATE',
        entityType: 'SubmissionRecord',
        entityId: updated.id,
        rationale: `Outcome ${submission.outcome ?? 'unset'} → ${outcome}${notes ? `: ${notes.slice(0, 200)}` : ''}`,
        sourceIp: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      // Recalculate the client's win-rate KPIs now that outcome changed.
      try {
        await recalculateClientStats(updated.clientCompanyId, consultingFirmId);
      } catch (statsErr) {
        logger.warn('PerformanceStats recalc failed after outcome change', {
          submissionId: updated.id,
          error: (statsErr as Error).message,
        });
      }

      res.json({
        success: true,
        data: {
          id: updated.id,
          outcome: updated.outcome,
          outcomeRecordedAt: updated.outcomeRecordedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
