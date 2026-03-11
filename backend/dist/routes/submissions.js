"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Submission Records Routes
// =============================================================
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const auth_2 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const penaltyEngine_1 = require("../engines/penaltyEngine");
const performanceStats_1 = require("../services/performanceStats");
const complianceStateMachine_1 = require("../services/complianceStateMachine");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
const CreateSubmissionSchema = zod_1.z.object({
    clientCompanyId: zod_1.z.string().uuid(),
    opportunityId: zod_1.z.string().uuid(),
    submittedAt: zod_1.z.string().datetime().transform((s) => new Date(s)),
    notes: zod_1.z.string().optional(),
});
const StatusTransitionSchema = zod_1.z.object({
    status: zod_1.z.enum(['PENDING', 'APPROVED', 'BLOCKED', 'REJECTED']),
    reason: zod_1.z.string().optional(),
});
/**
 * POST /api/submissions
 */
router.post('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const body = CreateSubmissionSchema.parse(req.body);
        const [client, opportunity] = await Promise.all([
            database_1.prisma.clientCompany.findFirst({
                where: { id: body.clientCompanyId, consultingFirmId },
            }),
            database_1.prisma.opportunity.findFirst({
                where: { id: body.opportunityId, consultingFirmId },
                select: { id: true, responseDeadline: true, estimatedValue: true, title: true },
            }),
        ]);
        if (!client)
            throw new errors_1.NotFoundError('ClientCompany');
        if (!opportunity)
            throw new errors_1.NotFoundError('Opportunity');
        // Compliance gate: reject if the BidDecision for this pair is BLOCKED
        const gate = await (0, complianceStateMachine_1.isSubmissionBlocked)(body.opportunityId, body.clientCompanyId);
        if (gate.blocked) {
            return res.status(422).json({
                success: false,
                error: 'Submission blocked by compliance review',
                code: 'COMPLIANCE_BLOCKED',
                detail: gate.reason,
            });
        }
        const wasOnTime = (0, penaltyEngine_1.evaluateOnTime)(body.submittedAt, opportunity.responseDeadline);
        const submission = await database_1.prisma.$transaction(async (tx) => {
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
                const penaltyResult = await (0, penaltyEngine_1.enforceAndLogPenalty)({
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
        (0, performanceStats_1.recalculateClientStats)(body.clientCompanyId, consultingFirmId).catch((err) => {
            logger_1.logger.error('Stats recalculation failed', { error: err });
        });
        logger_1.logger.info('Submission logged', {
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
                    ? `Submission was ${Math.ceil((body.submittedAt.getTime() - opportunity.responseDeadline.getTime()) /
                        (1000 * 60 * 60 * 24))} day(s) late`
                    : null,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/submissions
 */
router.get('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { clientCompanyId, opportunityId, wasOnTime, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = { consultingFirmId };
        if (clientCompanyId)
            where.clientCompanyId = clientCompanyId;
        if (opportunityId)
            where.opportunityId = opportunityId;
        if (wasOnTime !== undefined)
            where.wasOnTime = wasOnTime === 'true';
        const [submissions, total] = await Promise.all([
            database_1.prisma.submissionRecord.findMany({
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
            database_1.prisma.submissionRecord.count({ where }),
        ]);
        res.json({
            success: true,
            data: submissions,
            meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/submissions/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const submission = await database_1.prisma.submissionRecord.findFirst({
            where: { id: req.params.id, consultingFirmId },
            include: {
                clientCompany: true,
                opportunity: true,
                submittedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                financialPenalties: true,
            },
        });
        if (!submission)
            throw new errors_1.NotFoundError('SubmissionRecord');
        res.json({ success: true, data: submission });
    }
    catch (err) {
        next(err);
    }
});
/**
 * PATCH /api/submissions/:id/status  (ADMIN only)
 * Manually transition a submission's compliance status.
 */
router.patch('/:id/status', (0, auth_2.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { status, reason } = StatusTransitionSchema.parse(req.body);
        const result = await (0, complianceStateMachine_1.transitionSubmissionStatus)({
            submissionId: req.params.id,
            toStatus: status,
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
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=submissions.js.map