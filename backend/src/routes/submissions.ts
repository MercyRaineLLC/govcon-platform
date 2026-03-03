// =============================================================
// Submission Records Routes
// =============================================================
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticateJWT } from '../middleware/auth';
import { enforceTenantScope, getTenantId } from '../middleware/tenant';
import { AuthenticatedRequest } from '../types';
import { NotFoundError } from '../utils/errors';
import { evaluateOnTime, enforceAndLogPenalty } from '../engines/penaltyEngine';
import { recalculateClientStats } from '../services/performanceStats';
import { logger } from '../utils/logger';

const router = Router();
router.use(authenticateJWT, enforceTenantScope);

const CreateSubmissionSchema = z.object({
  clientCompanyId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  submittedAt: z.string().datetime().transform((s) => new Date(s)),
  notes: z.string().optional(),
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
        },
      });

      if (!wasOnTime) {
        const penaltyResult = await enforceAndLogPenalty({
          consultingFirmId,
          clientCompanyId: body.clientCompanyId,
          submissionRecordId: record.id,
          estimatedValue: opportunity.estimatedValue,
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
          financialPenalty: true,
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
        financialPenalty: true,
      },
    });

    if (!submission) throw new NotFoundError('SubmissionRecord');
    res.json({ success: true, data: submission });
  } catch (err) {
    next(err);
  }
});

export default router;