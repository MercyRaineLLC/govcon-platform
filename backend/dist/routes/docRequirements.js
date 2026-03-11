"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
const CreateRequirementSchema = zod_1.z.object({
    clientCompanyId: zod_1.z.string().min(1),
    opportunityId: zod_1.z.string().optional().nullable(),
    templateId: zod_1.z.string().optional().nullable(),
    title: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().max(4000).optional().nullable(),
    dueDate: zod_1.z.coerce.date(),
    isPenaltyEnabled: zod_1.z.boolean().optional().default(true),
    penaltyAmount: zod_1.z.coerce.number().min(0).optional().nullable(),
    penaltyPercent: zod_1.z.coerce.number().min(0).max(100).optional().nullable(),
    notes: zod_1.z.string().max(4000).optional().nullable(),
});
const UpdateRequirementSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200).optional(),
    description: zod_1.z.string().max(4000).optional().nullable(),
    dueDate: zod_1.z.coerce.date().optional(),
    opportunityId: zod_1.z.string().optional().nullable(),
    templateId: zod_1.z.string().optional().nullable(),
    isPenaltyEnabled: zod_1.z.boolean().optional(),
    penaltyAmount: zod_1.z.coerce.number().min(0).optional().nullable(),
    penaltyPercent: zod_1.z.coerce.number().min(0).max(100).optional().nullable(),
    status: zod_1.z.enum(['PENDING', 'SUBMITTED', 'OVERDUE']).optional(),
    notes: zod_1.z.string().max(4000).optional().nullable(),
});
function validatePenaltyChoice(input) {
    if (input.penaltyAmount != null && input.penaltyPercent != null) {
        throw new errors_1.ValidationError('Specify penaltyAmount or penaltyPercent, not both');
    }
}
async function validateOptionalTemplate(templateId, consultingFirmId) {
    if (!templateId)
        return;
    const template = await database_1.prisma.documentTemplate.findFirst({
        where: { id: templateId, consultingFirmId },
        select: { id: true, isActive: true },
    });
    if (!template)
        throw new errors_1.ValidationError('templateId not found for this firm');
    if (!template.isActive)
        throw new errors_1.ValidationError('templateId is inactive');
}
async function validateOptionalOpportunity(opportunityId, consultingFirmId) {
    if (!opportunityId)
        return;
    const opp = await database_1.prisma.opportunity.findFirst({
        where: { id: opportunityId, consultingFirmId },
        select: { id: true },
    });
    if (!opp)
        throw new errors_1.ValidationError('opportunityId not found for this firm');
}
// GET /api/doc-requirements
router.get('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { clientCompanyId, opportunityId } = req.query;
        const where = { consultingFirmId };
        if (clientCompanyId)
            where.clientCompanyId = clientCompanyId;
        if (opportunityId)
            where.opportunityId = opportunityId;
        const requirements = await database_1.prisma.documentRequirement.findMany({
            where,
            include: {
                clientCompany: { select: { id: true, name: true } },
                opportunity: { select: { id: true, title: true, responseDeadline: true } },
                template: { select: { id: true, title: true, fileName: true, category: true } },
            },
            orderBy: { dueDate: 'asc' },
        });
        res.json({ success: true, data: requirements });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/doc-requirements
router.post('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const body = CreateRequirementSchema.parse(req.body);
        validatePenaltyChoice(body);
        const client = await database_1.prisma.clientCompany.findFirst({
            where: { id: body.clientCompanyId, consultingFirmId, isActive: true },
            select: { id: true },
        });
        if (!client)
            throw new errors_1.NotFoundError('Client');
        await validateOptionalOpportunity(body.opportunityId, consultingFirmId);
        await validateOptionalTemplate(body.templateId, consultingFirmId);
        const requirement = await database_1.prisma.documentRequirement.create({
            data: {
                consultingFirmId,
                clientCompanyId: body.clientCompanyId,
                opportunityId: body.opportunityId || null,
                templateId: body.templateId || null,
                title: body.title,
                description: body.description || null,
                dueDate: body.dueDate,
                isPenaltyEnabled: body.isPenaltyEnabled,
                penaltyAmount: body.isPenaltyEnabled && body.penaltyAmount != null
                    ? body.penaltyAmount
                    : null,
                penaltyPercent: body.isPenaltyEnabled && body.penaltyPercent != null
                    ? body.penaltyPercent
                    : null,
                notes: body.notes || null,
                status: 'PENDING',
            },
            include: {
                clientCompany: { select: { id: true, name: true } },
                opportunity: { select: { id: true, title: true } },
                template: { select: { id: true, title: true, fileName: true, category: true } },
            },
        });
        logger_1.logger.info('Document requirement created', {
            id: requirement.id,
            clientCompanyId: requirement.clientCompanyId,
            templateId: requirement.templateId,
            createdBy: req.user?.userId,
        });
        res.status(201).json({ success: true, data: requirement });
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/doc-requirements/:id
router.put('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const existing = await database_1.prisma.documentRequirement.findFirst({
            where: { id: req.params.id, consultingFirmId },
        });
        if (!existing)
            throw new errors_1.NotFoundError('Document requirement');
        const body = UpdateRequirementSchema.parse(req.body);
        validatePenaltyChoice(body);
        if (body.opportunityId !== undefined) {
            await validateOptionalOpportunity(body.opportunityId, consultingFirmId);
        }
        if (body.templateId !== undefined) {
            await validateOptionalTemplate(body.templateId, consultingFirmId);
        }
        const isPenaltyEnabled = body.isPenaltyEnabled ?? existing.isPenaltyEnabled;
        const shouldSetSubmittedAt = body.status === 'SUBMITTED' &&
            !existing.submittedAt;
        const updated = await database_1.prisma.documentRequirement.update({
            where: { id: req.params.id },
            data: {
                title: body.title,
                description: body.description,
                dueDate: body.dueDate,
                opportunityId: body.opportunityId,
                templateId: body.templateId,
                isPenaltyEnabled,
                penaltyAmount: isPenaltyEnabled && body.penaltyAmount !== undefined
                    ? body.penaltyAmount
                    : isPenaltyEnabled
                        ? existing.penaltyAmount
                        : null,
                penaltyPercent: isPenaltyEnabled && body.penaltyPercent !== undefined
                    ? body.penaltyPercent
                    : isPenaltyEnabled
                        ? existing.penaltyPercent
                        : null,
                status: body.status,
                notes: body.notes,
                submittedAt: shouldSetSubmittedAt ? new Date() : undefined,
            },
            include: {
                clientCompany: { select: { id: true, name: true } },
                opportunity: { select: { id: true, title: true } },
                template: { select: { id: true, title: true, fileName: true, category: true } },
            },
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/doc-requirements/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const existing = await database_1.prisma.documentRequirement.findFirst({
            where: { id: req.params.id, consultingFirmId },
            select: { id: true },
        });
        if (!existing)
            throw new errors_1.NotFoundError('Document requirement');
        await database_1.prisma.documentRequirement.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/doc-requirements/client/:clientId
router.get('/client/:clientId', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const requirements = await database_1.prisma.documentRequirement.findMany({
            where: { clientCompanyId: req.params.clientId, consultingFirmId },
            include: {
                template: { select: { id: true, title: true, fileName: true, category: true } },
                opportunity: {
                    select: {
                        id: true,
                        title: true,
                        responseDeadline: true,
                        probabilityScore: true,
                        expectedValue: true,
                        scoreBreakdown: true,
                    },
                },
            },
            orderBy: { dueDate: 'asc' },
        });
        res.json({ success: true, data: requirements });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=docRequirements.js.map