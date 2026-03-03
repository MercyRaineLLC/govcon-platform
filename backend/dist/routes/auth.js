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
const errors_1 = require("../utils/errors");
const router = (0, express_1.Router)();
// ---- Schemas ----
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
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
        if (!user || !user.isActive) {
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
exports.default = router;
//# sourceMappingURL=auth.js.map