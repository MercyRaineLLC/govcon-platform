// =============================================================
// Auth Routes
// =============================================================
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database';
import { generateToken, authenticateJWT } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { consultingFirm: true },
    });

    if (!user || !user.isActive) {
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

export default router;