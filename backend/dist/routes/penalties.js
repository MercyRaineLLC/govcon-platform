"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Financial Penalties Routes
// GET  /api/penalties              - List penalties for tenant
// GET  /api/penalties/:id          - Get single penalty
// PUT  /api/penalties/:id/pay      - Mark penalty as paid
// GET  /api/penalties/summary      - Aggregate summary
// =============================================================
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const auth_2 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
/**
 * GET /api/penalties
 */
router.get('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const { clientCompanyId, isPaid, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = { consultingFirmId };
        if (clientCompanyId)
            where.clientCompanyId = clientCompanyId;
        if (isPaid !== undefined)
            where.isPaid = isPaid === 'true';
        const [penalties, total] = await Promise.all([
            database_1.prisma.financialPenalty.findMany({
                where,
                include: {
                    clientCompany: { select: { id: true, name: true } },
                    submissionRecord: {
                        include: {
                            opportunity: { select: { id: true, title: true, agency: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
            }),
            database_1.prisma.financialPenalty.count({ where }),
        ]);
        res.json({
            success: true,
            data: penalties,
            meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/penalties/summary
 * Aggregate penalty summary for tenant dashboard.
 */
router.get('/summary', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const [total, paid, unpaid] = await Promise.all([
            database_1.prisma.financialPenalty.aggregate({
                where: { consultingFirmId },
                _sum: { amount: true },
                _count: true,
            }),
            database_1.prisma.financialPenalty.aggregate({
                where: { consultingFirmId, isPaid: true },
                _sum: { amount: true },
                _count: true,
            }),
            database_1.prisma.financialPenalty.aggregate({
                where: { consultingFirmId, isPaid: false },
                _sum: { amount: true },
                _count: true,
            }),
        ]);
        res.json({
            success: true,
            data: {
                total: {
                    count: total._count,
                    amount: total._sum.amount || 0,
                },
                paid: {
                    count: paid._count,
                    amount: paid._sum.amount || 0,
                },
                outstanding: {
                    count: unpaid._count,
                    amount: unpaid._sum.amount || 0,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/penalties/:id
 */
router.get('/:id', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const penalty = await database_1.prisma.financialPenalty.findFirst({
            where: { id: req.params.id, consultingFirmId },
            include: {
                clientCompany: true,
                submissionRecord: { include: { opportunity: true } },
            },
        });
        if (!penalty)
            throw new errors_1.NotFoundError('FinancialPenalty');
        res.json({ success: true, data: penalty });
    }
    catch (err) {
        next(err);
    }
});
/**
 * PUT /api/penalties/:id/pay
 * Admin-only: Mark penalty as paid.
 */
router.put('/:id/pay', (0, auth_2.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const penalty = await database_1.prisma.financialPenalty.findFirst({
            where: { id: req.params.id, consultingFirmId },
        });
        if (!penalty)
            throw new errors_1.NotFoundError('FinancialPenalty');
        const updated = await database_1.prisma.financialPenalty.update({
            where: { id: req.params.id },
            data: { isPaid: true, paidAt: new Date() },
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=penalties.js.map