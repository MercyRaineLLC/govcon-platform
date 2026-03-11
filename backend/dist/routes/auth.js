"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// =============================================================
// Auth Routes
// =============================================================
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const database_1 = require("../config/database");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const passwordSchema = zod_1.z
    .string()
    .min(12)
    .regex(/[A-Z]/, 'Must include uppercase')
    .regex(/[a-z]/, 'Must include lowercase')
    .regex(/[0-9]/, 'Must include number')
    .regex(/[^A-Za-z0-9]/, 'Must include symbol');
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const RegisterFirmSchema = zod_1.z.object({
    firmName: zod_1.z.string().min(2).max(120),
    contactEmail: zod_1.z.string().email(),
    firstName: zod_1.z.string().min(1).max(60),
    lastName: zod_1.z.string().min(1).max(60),
    email: zod_1.z.string().email().optional(),
    password: passwordSchema,
});
const RegisterUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: passwordSchema,
    firstName: zod_1.z.string().min(1).max(60),
    lastName: zod_1.z.string().min(1).max(60),
    role: zod_1.z.enum(['ADMIN', 'CONSULTANT']).default('CONSULTANT'),
});
/**
 * POST /api/auth/register-firm
 * Creates tenant + first admin user.
 */
router.post('/register-firm', async (req, res, next) => {
    try {
        const body = RegisterFirmSchema.parse(req.body);
        const adminEmail = body.email || body.contactEmail;
        const existingFirm = await database_1.prisma.consultingFirm.findUnique({
            where: { contactEmail: body.contactEmail },
            select: { id: true },
        });
        if (existingFirm)
            throw new errors_1.ConflictError('A firm with this contact email already exists');
        const existingUser = await database_1.prisma.user.findUnique({
            where: { email: adminEmail },
            select: { id: true },
        });
        if (existingUser)
            throw new errors_1.ConflictError('A user with this email already exists');
        const passwordHash = await bcryptjs_1.default.hash(body.password, 12);
        const created = await database_1.prisma.$transaction(async (tx) => {
            const firm = await tx.consultingFirm.create({
                data: {
                    name: body.firmName,
                    contactEmail: body.contactEmail,
                },
            });
            const user = await tx.user.create({
                data: {
                    consultingFirmId: firm.id,
                    email: adminEmail,
                    passwordHash,
                    firstName: body.firstName,
                    lastName: body.lastName,
                    role: 'ADMIN',
                    isActive: true,
                },
            });
            return { firm, user };
        });
        const token = (0, auth_1.generateToken)({
            userId: created.user.id,
            consultingFirmId: created.firm.id,
            role: 'ADMIN',
            email: created.user.email,
        });
        res.status(201).json({
            success: true,
            data: {
                token,
                user: {
                    id: created.user.id,
                    email: created.user.email,
                    firstName: created.user.firstName,
                    lastName: created.user.lastName,
                    role: created.user.role,
                },
                firm: {
                    id: created.firm.id,
                    name: created.firm.name,
                    contactEmail: created.firm.contactEmail,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = LoginSchema.parse(req.body);
        const user = await database_1.prisma.user.findUnique({
            where: { email },
            include: { consultingFirm: true },
        });
        if (!user || !user.isActive || !user.consultingFirm.isActive) {
            throw new errors_1.UnauthorizedError('Invalid credentials');
        }
        const valid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!valid) {
            throw new errors_1.UnauthorizedError('Invalid credentials');
        }
        await database_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        const token = (0, auth_1.generateToken)({
            userId: user.id,
            consultingFirmId: user.consultingFirmId,
            role: user.role,
            email: user.email,
        });
        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                },
                firm: {
                    id: user.consultingFirm.id,
                    name: user.consultingFirm.name,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * GET /api/auth/profile
 */
router.get('/profile', auth_1.authenticateJWT, async (req, res, next) => {
    try {
        const user = await database_1.prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { consultingFirm: true },
        });
        if (!user)
            throw new errors_1.NotFoundError('User');
        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                consultingFirm: user.consultingFirm,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
/**
 * POST /api/auth/register-user
 * Adds a user inside the current tenant. ADMIN only.
 */
router.post('/register-user', auth_1.authenticateJWT, tenant_1.enforceTenantScope, (0, auth_1.requireRole)('ADMIN'), async (req, res, next) => {
    try {
        const body = RegisterUserSchema.parse(req.body);
        const consultingFirmId = (0, tenant_1.getTenantId)(req);
        const existing = await database_1.prisma.user.findUnique({
            where: { email: body.email },
            select: { id: true },
        });
        if (existing)
            throw new errors_1.ConflictError('A user with this email already exists');
        const user = await database_1.prisma.user.create({
            data: {
                consultingFirmId,
                email: body.email,
                passwordHash: await bcryptjs_1.default.hash(body.password, 12),
                firstName: body.firstName,
                lastName: body.lastName,
                role: body.role,
                isActive: true,
            },
        });
        logger_1.logger.info('User registered', {
            consultingFirmId,
            createdUserId: user.id,
            createdBy: req.user?.userId,
        });
        res.status(201).json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map