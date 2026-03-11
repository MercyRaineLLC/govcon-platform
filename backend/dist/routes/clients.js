"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const samEntityApi_1 = require("../services/samEntityApi");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateJWT, tenant_1.enforceTenantScope);
const ClientSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    cage: zod_1.z.string().optional(),
    uei: zod_1.z.string().optional(),
    ein: zod_1.z.string().optional(),
    naicsCodes: zod_1.z.array(zod_1.z.string()).default([]),
    sdvosb: zod_1.z.boolean().default(false),
    wosb: zod_1.z.boolean().default(false),
    hubzone: zod_1.z.boolean().default(false),
    smallBusiness: zod_1.z.boolean().default(true),
    phone: zod_1.z.string().optional(),
    website: zod_1.z.string().optional(),
    streetAddress: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    zipCode: zod_1.z.string().optional(),
    samRegStatus: zod_1.z.string().optional(),
    samRegExpiry: zod_1.z.coerce.date().optional(),
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
 * GET /api/clients/lookup?uei=...  OR  ?cage=...  OR  ?name=...
 * Looks up entity data from SAM.gov — does NOT create a record.
 * EIN lookup is NOT supported by the SAM.gov public API.
 */
router.get('/lookup', async (req, res) => {
    try {
        const { uei, cage, name } = req.query;
        if (!uei && !cage && !name) {
            return res.status(400).json({ success: false, error: 'Provide uei, cage, or name query parameter' });
        }
        let result = null;
        if (uei)
            result = await (0, samEntityApi_1.lookupEntityByUEI)(uei);
        else if (cage)
            result = await (0, samEntityApi_1.lookupEntityByCAGE)(cage);
        else if (name)
            result = await (0, samEntityApi_1.lookupEntityByName)(name);
        if (!result) {
            return res.status(404).json({ success: false, error: 'Entity not found in SAM.gov registry. Verify the UEI/CAGE is correct and the entity has an active registration.' });
        }
        res.json({ success: true, data: result });
    }
    catch (err) {
        res.status(502).json({ success: false, error: err.message || 'SAM.gov lookup failed' });
    }
});
/**
 * GET /api/clients/lookup-raw?uei=...  (Admin — see exact SAM response for debugging)
 */
router.get('/lookup-raw', (0, auth_1.requireRole)('ADMIN'), async (req, res) => {
    try {
        const axiosLib = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
        const { uei, cage, name } = req.query;
        const apiKey = process.env.SAM_API_KEY;
        const params = { api_key: apiKey, includeSections: 'entityRegistration,coreData,assertions' };
        if (uei)
            params.ueiSAM = uei.trim().toUpperCase();
        else if (cage)
            params.cageCode = cage.trim().toUpperCase();
        else if (name) {
            params.legalBusinessName = name.trim();
            params.registrationStatus = 'Active';
        }
        else
            return res.status(400).json({ error: 'Provide uei, cage, or name' });
        const samRes = await axiosLib.get('https://api.sam.gov/entity-information/v3/entities', { params, timeout: 20000 });
        res.json({ status: samRes.status, data: samRes.data });
    }
    catch (err) {
        res.json({ error: err.message, responseStatus: err.response?.status, responseData: err.response?.data });
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
 * PUT /api/clients/:id  (ADMIN only)
 */
router.put('/:id', (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
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
 * DELETE /api/clients/:id (soft delete, ADMIN only)
 */
router.delete('/:id', (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
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