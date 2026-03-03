"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Client Companies Routes
// GET    /api/clients
// POST   /api/clients
// GET    /api/clients/:id
// PUT    /api/clients/:id
// DELETE /api/clients/:id
// GET    /api/clients/:id/stats
// =============================================================
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const scoringWorker_1 = require("../workers/scoringWorker");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
const ClientSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    cage: zod_1.z.string().optional(),
    uei: zod_1.z.string().optional(),
    naicsCodes: zod_1.z.array(zod_1.z.string()).default([]),
    sdvosb: zod_1.z.boolean().default(false),
    wosb: zod_1.z.boolean().default(false),
    hubzone: zod_1.z.boolean().default(false),
    smallBusiness: zod_1.z.boolean().default(true),
});
/**
 * GET /api/clients
 */
router.get('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { page = '1', limit = '20', active } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = { consultingFirmId };
        if (active !== undefined)
            where.isActive = active === 'true';
        const [clients, total] = await Promise.all([
            database_1.prisma.clientCompany.findMany({
                where,
                include: { performanceStats: true },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { name: 'asc' },
            }),
            database_1.prisma.clientCompany.count({ where }),
        ]);
        res.json({
            success: true,
            data: clients,
            meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/clients
 */
router.post('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const body = ClientSchema.parse(req.body);
        const client = await database_1.prisma.$transaction(async (tx) => {
            const c = await tx.clientCompany.create({
                data: { ...body, consultingFirmId },
            });
            // Initialize performance stats row
            await tx.performanceStats.create({
                data: { clientCompanyId: c.id },
            });
            return c;
        });
        // Enqueue async scoring for this new client across all opportunities
        (0, scoringWorker_1.enqueueAllOpportunitiesForScoring)(consultingFirmId).catch(() => { });
        res.status(201).json({ success: true, data: client });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/clients/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const client = await database_1.prisma.clientCompany.findFirst({
            where: { id: req.params.id, consultingFirmId },
            include: {
                performanceStats: true,
                submissionRecords: {
                    include: {
                        opportunity: {
                            select: { id: true, title: true, agency: true, responseDeadline: true },
                        },
                    },
                    orderBy: { submittedAt: 'desc' },
                    take: 20,
                },
                financialPenalties: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
            },
        });
        if (!client)
            throw new errors_1.NotFoundError('ClientCompany');
        res.json({ success: true, data: client });
    }
    catch (err) {
        next(err);
    }
});
/**
 * PUT /api/clients/:id
 */
router.put('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const existing = await database_1.prisma.clientCompany.findFirst({
            where: { id: req.params.id, consultingFirmId },
        });
        if (!existing)
            throw new errors_1.NotFoundError('ClientCompany');
        const body = ClientSchema.partial().parse(req.body);
        const updated = await database_1.prisma.clientCompany.update({
            where: { id: req.params.id },
            data: body,
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
});
/**
 * DELETE /api/clients/:id (soft delete)
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const existing = await database_1.prisma.clientCompany.findFirst({
            where: { id: req.params.id, consultingFirmId },
        });
        if (!existing)
            throw new errors_1.NotFoundError('ClientCompany');
        await database_1.prisma.clientCompany.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        res.json({ success: true, data: { message: 'Client deactivated' } });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/clients/:id/stats
 */
router.get('/:id/stats', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const stats = await database_1.prisma.performanceStats.findFirst({
            where: { clientCompany: { id: req.params.id, consultingFirmId } },
            include: { clientCompany: { select: { id: true, name: true } } },
        });
        if (!stats)
            throw new errors_1.NotFoundError('PerformanceStats');
        res.json({ success: true, data: stats });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=clients.js.map