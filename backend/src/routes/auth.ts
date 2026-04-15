// =============================================================
// Auth Routes
// =============================================================
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/database';
import { generateToken, authenticateJWT, requireRole } from '../middleware/auth';
import { enforceTenantScope, getTenantId } from '../middleware/tenant';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError, NotFoundError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

// Stricter rate limit for login — 10 attempts per 15 minutes per IP
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please wait 15 minutes.', code: 'RATE_LIMITED' },
});

const router = Router();
const passwordSchema = z
  .string()
  .min(12)
  .regex(/[A-Z]/, 'Must include uppercase')
  .regex(/[a-z]/, 'Must include lowercase')
  .regex(/[0-9]/, 'Must include number')
  .regex(/[^A-Za-z0-9]/, 'Must include symbol')

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RegisterFirmSchema = z.object({
  firmName: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email().optional(),
  password: passwordSchema,
});

const RegisterUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  role: z.enum(['ADMIN', 'CONSULTANT']).default('CONSULTANT'),
});

/**
 * GET /api/auth/beta-status
 * Public — returns beta slot availability.
 */
router.get('/beta-status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const maxSlots = parseInt(process.env.MAX_BETA_SLOTS || '15', 10);
    const used = await prisma.consultingFirm.count();
    res.json({
      success: true,
      data: {
        slotsTotal: maxSlots,
        slotsUsed: used,
        slotsRemaining: Math.max(0, maxSlots - used),
        isBetaOpen: used < maxSlots,
      },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/register-firm
 * Creates tenant + first admin user.
 */
router.post('/register-firm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RegisterFirmSchema.parse(req.body);
    const adminEmail = body.email || body.contactEmail

    // Beta slot gate
    const maxSlots = parseInt(process.env.MAX_BETA_SLOTS || '15', 10);
    const firmCount = await prisma.consultingFirm.count();
    if (firmCount >= maxSlots) {
      return res.status(403).json({
        success: false,
        error: 'Beta registration is currently full. All slots have been claimed.',
        code: 'BETA_FULL',
      });
    }

    const existingFirm = await prisma.consultingFirm.findUnique({
      where: { contactEmail: body.contactEmail },
      select: { id: true },
    });
    if (existingFirm) throw new ConflictError('A firm with this contact email already exists');

    const existingUser = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    if (existingUser) throw new ConflictError('A user with this email already exists');

    const passwordHash = await bcrypt.hash(body.password, 12);

    const created = await prisma.$transaction(async (tx) => {
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

    const token = generateToken({
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
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', loginRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { consultingFirm: true },
    });

    if (!user || !user.isActive || !user.consultingFirm.isActive) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = generateToken({
      userId: user.id,
      consultingFirmId: user.consultingFirmId,
      role: user.role as any,
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
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/profile
 */
router.get(
  '/profile',
  authenticateJWT,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        include: { consultingFirm: true },
      });

      if (!user) throw new NotFoundError('User');

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
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/register-user
 * Adds a user inside the current tenant. ADMIN only.
 */
router.post(
  '/register-user',
  authenticateJWT,
  enforceTenantScope,
  requireRole('ADMIN'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = RegisterUserSchema.parse(req.body);
      const consultingFirmId = getTenantId(req);

      const existing = await prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      });
      if (existing) throw new ConflictError('A user with this email already exists');

      const user = await prisma.user.create({
        data: {
          consultingFirmId,
          email: body.email,
          passwordHash: await bcrypt.hash(body.password, 12),
          firstName: body.firstName,
          lastName: body.lastName,
          role: body.role,
          isActive: true,
        },
      });

      logger.info('User registered', {
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
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/auth/change-password
 * Authenticated user changes their own password.
 */
router.put(
  '/change-password',
  authenticateJWT,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        currentPassword: z.string().min(1),
        newPassword: passwordSchema,
      });
      const { currentPassword, newPassword } = schema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
      });
      if (!user) throw new NotFoundError('User');

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) throw new UnauthorizedError('Current password is incorrect');

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      logger.info('User changed password', { userId: user.id });

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/forgot-password
 * Generates a password reset token (valid 1 hour).
 * In production, this would send an email. For now, returns the token in response
 * so the frontend can redirect to the reset page.
 */
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate a secure random token
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    logger.info('Password reset token generated', { userId: user.id, email });

    // In production: send email with reset link
    // For now: return token so frontend can use it
    res.json({
      success: true,
      message: 'If that email exists, a reset link has been sent.',
      // Remove resetToken from response once email service is configured
      resetToken: token,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/reset-password
 * Resets password using a valid token.
 */
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      token: z.string().min(1),
      newPassword: passwordSchema,
    });
    const { token, newPassword } = schema.parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token. Please request a new one.',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    logger.info('Password reset completed', { userId: resetToken.userId });

    res.json({ success: true, message: 'Password has been reset. You can now sign in.' });
  } catch (err) {
    next(err);
  }
});

export default router;
