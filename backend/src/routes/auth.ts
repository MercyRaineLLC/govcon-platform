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
import { sendEmail, buildEmailVerificationUrl } from '../services/mailer';
import { logAudit } from '../services/auditService';

// -------------------------------------------------------------
// Helpers — email verification + current legal versions
// -------------------------------------------------------------

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function issueEmailVerificationToken(userId: string): Promise<string> {
  const cryptoMod = await import('crypto');
  const token = cryptoMod.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  await prisma.emailVerificationToken.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.emailVerificationToken.create({
    data: { userId, token, expiresAt },
  });
  return token;
}

async function getCurrentLegalVersions() {
  const [tos, nda] = await Promise.all([
    prisma.termsOfServiceVersion.findFirst({ where: { isCurrent: true } }),
    prisma.betaNdaVersion.findFirst({ where: { isCurrent: true } }),
  ]);
  if (!tos || !nda) {
    throw new Error('Legal documents are not seeded. Run `npm run db:seed`.');
  }
  return { tos, nda };
}

async function userHasAcceptedCurrentLegal(userId: string): Promise<boolean> {
  const { tos, nda } = await getCurrentLegalVersions();
  const [tosOk, ndaOk] = await Promise.all([
    prisma.userAgreement.findUnique({
      where: { userId_documentType_version: { userId, documentType: 'TOS', version: tos.version } },
    }),
    prisma.userAgreement.findUnique({
      where: { userId_documentType_version: { userId, documentType: 'BETA_NDA', version: nda.version } },
    }),
  ]);
  return Boolean(tosOk && ndaOk);
}

/**
 * Beta-program gate — user must have answered the current ISO week's
 * BetaWeeklyQuestionnaire before login is permitted. Returns the
 * questionnaire id when missing so the frontend can render the form
 * inline on the login response.
 */
async function userHasAnsweredCurrentQuestionnaire(userId: string): Promise<{ ok: boolean; questionnaireId?: string; weekStarting?: Date }> {
  const current = await prisma.betaWeeklyQuestionnaire.findFirst({
    where: { isActive: true },
    orderBy: { weekStarting: 'desc' },
    select: { id: true, weekStarting: true },
  });
  if (!current) {
    // No questionnaire published yet for this week — the worker hasn't fired
    // (e.g., droplet down at 13:00 UTC Monday) and no one has hit
    // /api/beta/questionnaire/current to ensure-create one. Fail open: do
    // not lock users out of the platform because of operator-side absence.
    return { ok: true };
  }
  const response = await prisma.betaQuestionnaireResponse.findUnique({
    where: { questionnaireId_userId: { questionnaireId: current.id, userId } },
    select: { id: true },
  });
  return {
    ok: Boolean(response),
    questionnaireId: current.id,
    weekStarting: current.weekStarting,
  };
}

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
  acceptedTosVersion: z.string().min(1),
  acceptedBetaNdaVersion: z.string().min(1),
});

const RegisterUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  role: z.enum(['ADMIN', 'CONSULTANT']).default('CONSULTANT'),
});

const AcceptAgreementsSchema = z.object({
  acceptedTosVersion: z.string().min(1),
  acceptedBetaNdaVersion: z.string().min(1),
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
 * Creates tenant + first admin user. Requires acceptance of the
 * current ToS and Beta NDA. User must verify their email (and accept
 * agreements during signup) before login is permitted.
 */
router.post('/register-firm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RegisterFirmSchema.parse(req.body);
    const adminEmail = body.email || body.contactEmail;

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

    // Legal version gate — must accept the current ToS + NDA versions.
    const { tos, nda } = await getCurrentLegalVersions();
    if (body.acceptedTosVersion !== tos.version) {
      return res.status(409).json({
        success: false,
        error: `Terms of Service have been updated. Please accept v${tos.version}.`,
        code: 'TOS_VERSION_MISMATCH',
        currentVersion: tos.version,
      });
    }
    if (body.acceptedBetaNdaVersion !== nda.version) {
      return res.status(409).json({
        success: false,
        error: `Beta NDA has been updated. Please accept v${nda.version}.`,
        code: 'NDA_VERSION_MISMATCH',
        currentVersion: nda.version,
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
    const ip = req.ip ?? null;
    const userAgent = req.get('user-agent') ?? null;

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
          isEmailVerified: false,
        },
      });

      // Persist immutable evidence of acceptance — version + contentHash
      // are pinned to whatever was current at the moment of signup.
      await tx.userAgreement.createMany({
        data: [
          {
            userId: user.id,
            documentType: 'TOS',
            documentId: tos.id,
            version: tos.version,
            contentHash: tos.contentHash,
            ip,
            userAgent,
          },
          {
            userId: user.id,
            documentType: 'BETA_NDA',
            documentId: nda.id,
            version: nda.version,
            contentHash: nda.contentHash,
            ip,
            userAgent,
          },
        ],
      });

      return { firm, user };
    });

    // Issue a verification token and "send" the email (dev mode logs).
    const verificationToken = await issueEmailVerificationToken(created.user.id);
    const verificationUrl = buildEmailVerificationUrl(verificationToken);
    await sendEmail({
      to: adminEmail,
      subject: 'Verify your Mercy Raine GovCon account',
      category: 'EMAIL_VERIFICATION',
      textBody: `Welcome ${created.user.firstName},\n\nVerify your email to activate your Mercy Raine GovCon account:\n\n${verificationUrl}\n\nThis link expires in 24 hours.`,
    });

    void logAudit({
      consultingFirmId: created.firm.id,
      actorUserId: created.user.id,
      action: 'CREATE',
      entityType: 'User',
      entityId: created.user.id,
      rationale: 'Firm registration; awaiting email verification',
      sourceIp: ip,
      userAgent,
    });

    res.status(201).json({
      success: true,
      data: {
        requiresEmailVerification: true,
        email: created.user.email,
        firmName: created.firm.name,
        // Dev mode only — production should rely on the email link.
        // Remove once a real mail provider is wired up.
        verificationToken,
        verificationUrl,
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

    // Gate 1 — email must be verified before any session is issued.
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        error: 'Verify your email before signing in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Gate 2 — current ToS + Beta NDA must be accepted.
    const agreementsOk = await userHasAcceptedCurrentLegal(user.id);
    if (!agreementsOk) {
      const { tos, nda } = await getCurrentLegalVersions();
      return res.status(403).json({
        success: false,
        error: 'You must accept the current Terms of Service and Beta NDA before signing in.',
        code: 'AGREEMENT_REQUIRED',
        currentVersions: { tosVersion: tos.version, betaNdaVersion: nda.version },
      });
    }

    // Gate 3 — beta participants must answer the current week's
    // questionnaire before login is permitted. We issue a SCOPED
    // completion token (scope='beta_questionnaire') that ONLY the
    // /api/beta/questionnaire/complete endpoint accepts. After the
    // user submits, that endpoint records the response and issues
    // the full JWT.
    const qStatus = await userHasAnsweredCurrentQuestionnaire(user.id);
    if (!qStatus.ok) {
      const completionToken = generateToken({
        userId: user.id,
        consultingFirmId: user.consultingFirmId,
        role: user.role as any,
        email: user.email,
        // Scoped — full-access middleware rejects this on every other route
        scope: 'beta_questionnaire',
      } as any);
      return res.status(403).json({
        success: false,
        error: 'Please complete this week’s beta feedback questionnaire before signing in.',
        code: 'BETA_QUESTIONNAIRE_REQUIRED',
        questionnaireId: qStatus.questionnaireId,
        weekStarting: qStatus.weekStarting,
        completionToken,
      });
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

    void logAudit({
      consultingFirmId: user.consultingFirmId,
      actorUserId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      sourceIp: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
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
          isEmailVerified: false,
        },
      });

      // Email-verify the new tenant user. They will also be prompted to
      // accept the current ToS + Beta NDA on first sign-in.
      const verificationToken = await issueEmailVerificationToken(user.id);
      const verificationUrl = buildEmailVerificationUrl(verificationToken);
      await sendEmail({
        to: user.email,
        subject: 'You have been added to a Mercy Raine GovCon workspace',
        category: 'EMAIL_VERIFICATION',
        textBody: `Hi ${user.firstName},\n\nYou were invited to a Mercy Raine GovCon workspace. Verify your email to activate your account:\n\n${verificationUrl}\n\nThis link expires in 24 hours.`,
      });

      logger.info('User registered (verification pending)', {
        consultingFirmId,
        createdUserId: user.id,
        createdBy: req.user?.userId,
      });

      void logAudit({
        consultingFirmId,
        actorUserId: req.user?.userId ?? null,
        action: 'CREATE',
        entityType: 'User',
        entityId: user.id,
        rationale: 'Admin-invited user; verification pending',
        sourceIp: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          requiresEmailVerification: true,
          // Dev only — remove once a real mail provider is wired up.
          verificationToken,
          verificationUrl,
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

// =============================================================
// LEGAL — current ToS + Beta NDA, post-signup acceptance flow
// =============================================================

/**
 * GET /api/auth/legal/current
 * Public — returns the current ToS + Beta NDA (version, hash, body)
 * so the signup screen can display them and pin the version the user
 * is accepting.
 */
router.get('/legal/current', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { tos, nda } = await getCurrentLegalVersions();
    res.json({
      success: true,
      data: {
        tos: { version: tos.version, title: tos.title, contentHash: tos.contentHash, body: tos.body, effectiveAt: tos.effectiveAt },
        betaNda: { version: nda.version, title: nda.title, contentHash: nda.contentHash, body: nda.body, effectiveAt: nda.effectiveAt },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/verify-email { token }
 * Marks the user's email as verified. Public — token-bound.
 */
router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);

    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.consumedAt || record.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification token. Request a new one.',
        code: 'INVALID_OR_EXPIRED',
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    void logAudit({
      consultingFirmId: record.user.consultingFirmId,
      actorUserId: record.user.id,
      action: 'EMAIL_VERIFIED',
      entityType: 'User',
      entityId: record.user.id,
      sourceIp: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });

    res.json({
      success: true,
      message: 'Email verified. You can now sign in.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/resend-verification { email }
 * Public, rate-limited. Always returns success to prevent enumeration.
 */
router.post(
  '/resend-verification',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many resend attempts. Try again later.', code: 'RATE_LIMITED' },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, firstName: true, isEmailVerified: true, email: true },
      });

      // Always respond success to avoid revealing whether the email exists.
      if (!user || user.isEmailVerified) {
        return res.json({ success: true, message: 'If an unverified account exists, a new link has been sent.' });
      }

      const token = await issueEmailVerificationToken(user.id);
      const url = buildEmailVerificationUrl(token);
      await sendEmail({
        to: user.email,
        subject: 'Mercy Raine GovCon — new verification link',
        category: 'EMAIL_VERIFICATION',
        textBody: `Hi ${user.firstName},\n\nHere is a new verification link:\n\n${url}\n\nThis link expires in 24 hours.`,
      });

      res.json({ success: true, message: 'If an unverified account exists, a new link has been sent.', verificationUrl: url });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/accept-agreements
 * Authenticated. Records acceptance of the current ToS + Beta NDA. Used
 * when an existing user must re-accept after a version bump (or when an
 * admin-invited user accepts on first sign-in).
 */
router.post(
  '/accept-agreements',
  authenticateJWT,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body = AcceptAgreementsSchema.parse(req.body);
      const { tos, nda } = await getCurrentLegalVersions();

      if (body.acceptedTosVersion !== tos.version) {
        return res.status(409).json({
          success: false,
          error: 'Stale Terms of Service version. Please reload and accept the latest.',
          code: 'TOS_VERSION_MISMATCH',
          currentVersion: tos.version,
        });
      }
      if (body.acceptedBetaNdaVersion !== nda.version) {
        return res.status(409).json({
          success: false,
          error: 'Stale Beta NDA version. Please reload and accept the latest.',
          code: 'NDA_VERSION_MISMATCH',
          currentVersion: nda.version,
        });
      }

      const userId = req.user!.userId;
      const ip = req.ip ?? null;
      const userAgent = req.get('user-agent') ?? null;

      await prisma.userAgreement.createMany({
        data: [
          { userId, documentType: 'TOS', documentId: tos.id, version: tos.version, contentHash: tos.contentHash, ip, userAgent },
          { userId, documentType: 'BETA_NDA', documentId: nda.id, version: nda.version, contentHash: nda.contentHash, ip, userAgent },
        ],
        skipDuplicates: true,
      });

      void logAudit({
        consultingFirmId: req.user!.consultingFirmId,
        actorUserId: userId,
        action: 'AGREEMENT_ACCEPTED',
        entityType: 'UserAgreement',
        entityId: userId,
        rationale: `Accepted ToS v${tos.version} and Beta NDA v${nda.version}`,
        sourceIp: ip,
        userAgent,
      });

      res.json({ success: true, message: 'Agreements recorded.' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
