"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
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
        const { clientCompanyId, opportunityId, title, description, dueDate, isPenaltyEnabled, penaltyAmount, penaltyPercent, notes } = req.body;
        if (!clientCompanyId)
            throw new errors_1.ValidationError('clientCompanyId required');
        if (!title)
            throw new errors_1.ValidationError('title required');
        if (!dueDate)
            throw new errors_1.ValidationError('dueDate required');
        // Verify client belongs to this firm
        const client = await database_1.prisma.clientCompany.findFirst({ where: { id: clientCompanyId, consultingFirmId } });
        if (!client)
            throw new errors_1.NotFoundError('Client not found');
        const requirement = await database_1.prisma.documentRequirement.create({
            data: {
                consultingFirmId,
                clientCompanyId,
                opportunityId: opportunityId || null,
                title,
                description: description || null,
                dueDate: new Date(dueDate),
                isPenaltyEnabled: isPenaltyEnabled !== false,
                penaltyAmount: penaltyAmount ? parseFloat(penaltyAmount) : null,
                penaltyPercent: penaltyPercent ? parseFloat(penaltyPercent) : null,
                notes: notes || null,
                status: 'PENDING',
            },
            include: {
                clientCompany: { select: { id: true, name: true } },
                opportunity: { select: { id: true, title: true } },
            },
        });
        logger_1.logger.info('Document requirement created', { id: requirement.id, clientCompanyId });
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
        const existing = await database_1.prisma.documentRequirement.findFirst({ where: { id: req.params.id, consultingFirmId } });
        if (!existing)
            throw new errors_1.NotFoundError('Document requirement not found');
        const { title, description, dueDate, isPenaltyEnabled, penaltyAmount, penaltyPercent, status, notes } = req.body;
        const updateData = {};
        if (title !== undefined)
            updateData.title = title;
        if (description !== undefined)
            updateData.description = description;
        if (dueDate !== undefined)
            updateData.dueDate = new Date(dueDate);
        if (isPenaltyEnabled !== undefined)
            updateData.isPenaltyEnabled = isPenaltyEnabled;
        if (penaltyAmount !== undefined)
            updateData.penaltyAmount = penaltyAmount ? parseFloat(penaltyAmount) : null;
        if (penaltyPercent !== undefined)
            updateData.penaltyPercent = penaltyPercent ? parseFloat(penaltyPercent) : null;
        if (notes !== undefined)
            updateData.notes = notes;
        if (status !== undefined) {
            updateData.status = status;
            if (status === 'SUBMITTED' && !existing.submittedAt) {
                updateData.submittedAt = new Date();
            }
        }
        const updated = await database_1.prisma.documentRequirement.update({
            where: { id: req.params.id },
            data: updateData,
            include: {
                clientCompany: { select: { id: true, name: true } },
                opportunity: { select: { id: true, title: true } },
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
        const existing = await database_1.prisma.documentRequirement.findFirst({ where: { id: req.params.id, consultingFirmId } });
        if (!existing)
            throw new errors_1.NotFoundError('Document requirement not found');
        await database_1.prisma.documentRequirement.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/doc-requirements/client/:clientId — client portal view
router.get('/client/:clientId', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const requirements = await database_1.prisma.documentRequirement.findMany({
            where: { clientCompanyId: req.params.clientId, consultingFirmId },
            include: {
                opportunity: { select: { id: true, title: true, responseDeadline: true, probabilityScore: true, expectedValue: true, scoreBreakdown: true } },
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