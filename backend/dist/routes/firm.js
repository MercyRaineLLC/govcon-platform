"use strict";
// =============================================================
// Firm Dashboard Routes
// Multi-tenant protected endpoints
// =============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const router = (0, express_1.Router)();
router.get('/dashboard', auth_1.authenticateJWT, tenant_1.enforceTenantScope, async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const now = new Date();
        const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const twentyDays = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [totalOpportunities, redOpps, yellowOpps, recentPenalties, topOpps,] = await Promise.all([
            database_1.prisma.opportunity.count({
                where: { consultingFirmId },
            }),
            database_1.prisma.opportunity.count({
                where: {
                    consultingFirmId,
                    status: 'ACTIVE',
                    responseDeadline: {
                        gte: now,
                        lte: sevenDays,
                    },
                },
            }),
            database_1.prisma.opportunity.count({
                where: {
                    consultingFirmId,
                    status: 'ACTIVE',
                    responseDeadline: {
                        gt: sevenDays,
                        lte: twentyDays,
                    },
                },
            }),
            database_1.prisma.financialPenalty.aggregate({
                where: {
                    consultingFirmId,
                    createdAt: { gte: thirtyDaysAgo },
                },
                _sum: { amount: true },
                _count: true,
            }),
            database_1.prisma.opportunity.findMany({
                where: {
                    consultingFirmId,
                    status: 'ACTIVE',
                    expectedValue: { gt: 0 },
                },
                orderBy: { expectedValue: 'desc' },
                take: 5,
                select: {
                    id: true,
                    title: true,
                    agency: true,
                    naicsCode: true,
                    estimatedValue: true,
                    probabilityScore: true,
                    expectedValue: true,
                    responseDeadline: true,
                    setAsideType: true,
                },
            }),
        ]);
        res.json({
            success: true,
            data: {
                totalOpportunities,
                deadlineAlerts: {
                    red: redOpps,
                    yellow: yellowOpps,
                },
                recentPenalties: {
                    count: recentPenalties._count,
                    total: Number(recentPenalties._sum.amount || 0),
                },
                topOpportunities: topOpps.map((o) => ({
                    ...o,
                    deadline: {
                        daysUntil: Math.ceil((o.responseDeadline.getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)),
                    },
                })),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=firm.js.map