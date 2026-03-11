"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Firm Routes
// Multi-tenant protected endpoints
// =============================================================
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
const UpdatePenaltySchema = zod_1.z.object({
    flatLateFee: zod_1.z.union([zod_1.z.coerce.number().min(0), zod_1.z.null()]).optional(),
    penaltyPercent: zod_1.z.union([zod_1.z.coerce.number().min(0).max(1), zod_1.z.null()]).optional(),
});
// -------------------------------------------------------------
// GET /api/firm
// -------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const [firm, activeClientCount] = await Promise.all([
            database_1.prisma.consultingFirm.findUnique({
                where: { id: consultingFirmId },
                include: {
                    _count: {
                        select: {
                            users: true,
                            clientCompanies: true,
                            opportunities: true,
                            bidDecisions: true,
                            documentTemplates: true,
                        },
                    },
                },
            }),
            database_1.prisma.clientCompany.count({
                where: { consultingFirmId, isActive: true },
            }),
        ]);
        if (!firm || !firm.isActive)
            throw new errors_1.NotFoundError('Consulting firm');
        res.json({
            success: true,
            data: {
                id: firm.id,
                name: firm.name,
                contactEmail: firm.contactEmail,
                flatLateFee: firm.flatLateFee != null ? Number(firm.flatLateFee) : null,
                penaltyPercent: firm.penaltyPercent != null ? Number(firm.penaltyPercent) : null,
                lastIngestedAt: firm.lastIngestedAt,
                isActive: firm.isActive,
                createdAt: firm.createdAt,
                updatedAt: firm.updatedAt,
                activeClientCount,
                _count: firm._count,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// GET /api/firm/metrics
// -------------------------------------------------------------
router.get('/metrics', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const [activeClients, activeOpportunities, openRequirements, totalPenalties, pipeline, perf] = await Promise.all([
            database_1.prisma.clientCompany.count({
                where: { consultingFirmId, isActive: true },
            }),
            database_1.prisma.opportunity.count({
                where: { consultingFirmId, status: 'ACTIVE' },
            }),
            database_1.prisma.documentRequirement.count({
                where: { consultingFirmId, status: 'PENDING' },
            }),
            database_1.prisma.financialPenalty.aggregate({
                where: { consultingFirmId },
                _sum: { amount: true },
                _count: true,
            }),
            database_1.prisma.opportunity.aggregate({
                where: { consultingFirmId, status: 'ACTIVE' },
                _sum: { expectedValue: true, estimatedValue: true },
            }),
            database_1.prisma.performanceStats.aggregate({
                where: { clientCompany: { consultingFirmId } },
                _avg: { completionRate: true },
                _sum: { totalSubmitted: true, totalWon: true, totalLost: true, totalPenalties: true },
            }),
        ]);
        res.json({
            success: true,
            data: {
                activeClients,
                activeOpportunities,
                openRequirements,
                totalPenalties: Number(totalPenalties._sum.amount || 0),
                totalPenaltyEvents: totalPenalties._count,
                pipelineExpectedValue: Number(pipeline._sum.expectedValue || 0),
                pipelineEstimatedValue: Number(pipeline._sum.estimatedValue || 0),
                aggregateCompletionRate: perf._avg.completionRate || 0,
                totalSubmitted: perf._sum.totalSubmitted || 0,
                totalWon: perf._sum.totalWon || 0,
                totalLost: perf._sum.totalLost || 0,
                totalPenaltyAppliedToClients: Number(perf._sum.totalPenalties || 0),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// GET /api/firm/users
// -------------------------------------------------------------
router.get('/users', (0, auth_1.requireRole)('ADMIN', 'CONSULTANT'), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const users = await database_1.prisma.user.findMany({
            where: { consultingFirmId, isActive: true },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                lastLoginAt: true,
                createdAt: true,
            },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        });
        res.json({ success: true, data: users });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// PUT /api/firm/penalty-config
// -------------------------------------------------------------
router.put('/penalty-config', (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const body = UpdatePenaltySchema.parse(req.body);
        const updated = await database_1.prisma.consultingFirm.update({
            where: { id: consultingFirmId },
            data: {
                flatLateFee: body.flatLateFee,
                penaltyPercent: body.penaltyPercent,
            },
            select: {
                id: true,
                flatLateFee: true,
                penaltyPercent: true,
                updatedAt: true,
            },
        });
        res.json({
            success: true,
            data: {
                ...updated,
                flatLateFee: updated.flatLateFee != null ? Number(updated.flatLateFee) : null,
                penaltyPercent: updated.penaltyPercent != null ? Number(updated.penaltyPercent) : null,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// -------------------------------------------------------------
// POST /api/firm/seed-demo
// Adds realistic opportunities for demos/training.
// -------------------------------------------------------------
router.post('/seed-demo', (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const now = new Date();
        const day = 24 * 60 * 60 * 1000;
        const seedRows = [
            {
                samNoticeId: 'DEMO-SAM-001',
                title: 'Regional Medical Supply Chain Logistics Support',
                agency: 'Department of Veterans Affairs',
                naicsCode: '493110',
                setAsideType: 'SDVOSB',
                marketCategory: 'LOGISTICS',
                estimatedValue: 1450000,
                postedDate: new Date(now.getTime() - 3 * day),
                responseDeadline: new Date(now.getTime() + 11 * day),
                description: 'End-to-end warehousing, distribution, and last-mile logistics support for medical supplies.',
            },
            {
                samNoticeId: 'DEMO-SAM-002',
                title: 'DOT Fleet Maintenance and Dispatch Services',
                agency: 'Department of Transportation',
                naicsCode: '488510',
                setAsideType: 'SMALL_BUSINESS',
                marketCategory: 'TRANSPORTATION',
                estimatedValue: 890000,
                postedDate: new Date(now.getTime() - 2 * day),
                responseDeadline: new Date(now.getTime() + 17 * day),
                description: 'Fleet upkeep, dispatch operations, and route optimization services.',
            },
            {
                samNoticeId: 'DEMO-SAM-003',
                title: 'Federal Warehouse Inventory Management Platform',
                agency: 'General Services Administration',
                naicsCode: '541512',
                setAsideType: 'NONE',
                marketCategory: 'IT',
                estimatedValue: 3200000,
                postedDate: new Date(now.getTime() - 1 * day),
                responseDeadline: new Date(now.getTime() + 26 * day),
                description: 'SaaS-enabled inventory visibility and compliance reporting across federal sites.',
            },
            {
                samNoticeId: 'DEMO-SAM-004',
                title: 'DoD Ground Transportation Support',
                agency: 'Department of Defense',
                naicsCode: '484110',
                setAsideType: 'HUBZONE',
                marketCategory: 'TRANSPORTATION',
                estimatedValue: 2100000,
                postedDate: new Date(now.getTime() - 4 * day),
                responseDeadline: new Date(now.getTime() + 7 * day),
                description: 'Regional over-the-road cargo and mission-essential transportation support.',
            },
            {
                samNoticeId: 'DEMO-SAM-005',
                title: 'USDA Cold-Chain Distribution Contract',
                agency: 'Department of Agriculture',
                naicsCode: '484220',
                setAsideType: 'WOSB',
                marketCategory: 'LOGISTICS',
                estimatedValue: 760000,
                postedDate: new Date(now.getTime() - 6 * day),
                responseDeadline: new Date(now.getTime() + 14 * day),
                description: 'Temperature-controlled transport and chain-of-custody tracking for food programs.',
            },
            {
                samNoticeId: 'DEMO-SAM-006',
                title: 'FEMA Emergency Response Staging and Distribution',
                agency: 'Department of Homeland Security',
                naicsCode: '493190',
                setAsideType: 'SMALL_BUSINESS',
                marketCategory: 'LOGISTICS',
                estimatedValue: 5000000,
                postedDate: new Date(now.getTime() - 5 * day),
                responseDeadline: new Date(now.getTime() + 21 * day),
                description: 'Rapid staging, storage, and movement of emergency response supplies.',
            },
            {
                samNoticeId: 'DEMO-SAM-007',
                title: 'FAA Parts Procurement and Supplier Management',
                agency: 'Federal Aviation Administration',
                naicsCode: '423860',
                setAsideType: 'SDVOSB',
                marketCategory: 'SUPPLY_CHAIN',
                estimatedValue: 1100000,
                postedDate: new Date(now.getTime() - 7 * day),
                responseDeadline: new Date(now.getTime() + 9 * day),
                description: 'Strategic sourcing and replenishment of aviation-critical components.',
            },
            {
                samNoticeId: 'DEMO-SAM-008',
                title: 'Navy Base Contract Packaging and Kitting Services',
                agency: 'Department of the Navy',
                naicsCode: '561910',
                setAsideType: '8A',
                marketCategory: 'SERVICES',
                estimatedValue: 640000,
                postedDate: new Date(now.getTime() - 8 * day),
                responseDeadline: new Date(now.getTime() + 30 * day),
                description: 'Packaging, labeling, and kitting support for distributed military supply operations.',
            },
        ];
        const result = await database_1.prisma.opportunity.createMany({
            data: seedRows.map((row) => ({
                consultingFirmId,
                samNoticeId: row.samNoticeId,
                title: row.title,
                agency: row.agency,
                naicsCode: row.naicsCode,
                setAsideType: row.setAsideType,
                marketCategory: row.marketCategory,
                estimatedValue: row.estimatedValue,
                postedDate: row.postedDate,
                responseDeadline: row.responseDeadline,
                description: row.description,
                status: 'ACTIVE',
                isScored: false,
            })),
            skipDuplicates: true,
        });
        res.json({
            success: true,
            data: {
                created: result.count,
                skipped: seedRows.length - result.count,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.get('/dashboard', async (req, res, next) => {
    try {
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const now = new Date();
        const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const twentyDays = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [totalOpportunities, redOpps, yellowOpps, recentPenalties, topOpps, clientMetrics, pipelineValue, avgWinProb, recentDecisions, probDistribution,] = await Promise.all([
            database_1.prisma.opportunity.count({
                where: { consultingFirmId },
            }),
            database_1.prisma.opportunity.count({
                where: {
                    consultingFirmId,
                    status: 'ACTIVE',
                    responseDeadline: { gte: now, lte: sevenDays },
                },
            }),
            database_1.prisma.opportunity.count({
                where: {
                    consultingFirmId,
                    status: 'ACTIVE',
                    responseDeadline: { gt: sevenDays, lte: twentyDays },
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
                take: 6,
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
                    isEnriched: true,
                    historicalWinner: true,
                    competitionCount: true,
                    incumbentProbability: true,
                    bidDecisions: {
                        select: {
                            recommendation: true,
                            winProbability: true,
                            complianceStatus: true,
                            clientCompany: { select: { name: true } },
                        },
                        take: 3,
                    },
                },
            }),
            database_1.prisma.clientCompany.findMany({
                where: { consultingFirmId, isActive: true },
                select: {
                    id: true,
                    name: true,
                    performanceStats: {
                        select: {
                            completionRate: true,
                            totalPenalties: true,
                            totalWon: true,
                            totalLost: true,
                            totalSubmitted: true,
                        },
                    },
                },
            }),
            database_1.prisma.opportunity.aggregate({
                where: { consultingFirmId, status: 'ACTIVE' },
                _sum: { expectedValue: true, estimatedValue: true },
            }),
            database_1.prisma.bidDecision.aggregate({
                where: { consultingFirmId },
                _avg: { winProbability: true },
            }),
            database_1.prisma.bidDecision.findMany({
                where: { consultingFirmId },
                orderBy: { updatedAt: 'desc' },
                take: 10,
                select: {
                    id: true,
                    recommendation: true,
                    winProbability: true,
                    expectedValue: true,
                    complianceStatus: true,
                    riskScore: true,
                    opportunity: { select: { id: true, title: true, agency: true } },
                    clientCompany: { select: { id: true, name: true } },
                },
            }),
            database_1.prisma.opportunity.groupBy({
                by: ['probabilityScore'],
                where: {
                    consultingFirmId,
                    isScored: true,
                    probabilityScore: { gt: 0 },
                },
                _count: true,
            }),
        ]);
        const clientBreakdown = clientMetrics.map((c) => ({
            id: c.id,
            name: c.name,
            completionRate: c.performanceStats?.completionRate || 0,
            totalPenalties: Number(c.performanceStats?.totalPenalties || 0),
            totalWon: c.performanceStats?.totalWon || 0,
            totalLost: c.performanceStats?.totalLost || 0,
            totalSubmitted: c.performanceStats?.totalSubmitted || 0,
        }));
        const totalClients = clientBreakdown.length;
        const aggregateCompletionRate = totalClients > 0
            ? clientBreakdown.reduce((sum, c) => sum + c.completionRate, 0) / totalClients
            : 0;
        const probBuckets = Array.from({ length: 10 }, (_, i) => ({
            range: `${i * 10}-${(i + 1) * 10}%`,
            count: 0,
        }));
        for (const row of probDistribution) {
            const bucket = Math.min(9, Math.floor(row.probabilityScore * 10));
            probBuckets[bucket].count += row._count;
        }
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
                pipelineValue: {
                    totalExpected: Number(pipelineValue._sum.expectedValue || 0),
                    totalEstimated: Number(pipelineValue._sum.estimatedValue || 0),
                },
                avgWinProbability: avgWinProb._avg.winProbability || 0,
                topOpportunities: topOpps.map((o) => ({
                    ...o,
                    estimatedValue: Number(o.estimatedValue || 0),
                    expectedValue: Number(o.expectedValue || 0),
                    deadline: {
                        daysUntil: Math.ceil((o.responseDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
                    },
                })),
                recentDecisions: recentDecisions.map((d) => ({
                    ...d,
                    expectedValue: Number(d.expectedValue || 0),
                })),
                firmMetrics: {
                    totalClients,
                    aggregateCompletionRate,
                    clientBreakdown,
                },
                probDistribution: probBuckets,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=firm.js.map