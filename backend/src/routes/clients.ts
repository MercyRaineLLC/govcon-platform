// =============================================================
// Client Companies Routes
// GET    /api/clients
// POST   /api/clients
// GET    /api/clients/:id
// PUT    /api/clients/:id
// DELETE /api/clients/:id
// GET    /api/clients/:id/stats
// =============================================================
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticateJWT, requireRole } from '../middleware/auth';
import { enforceTenantScope, getTenantId } from '../middleware/tenant';
import { AuthenticatedRequest } from '../types';
import { NotFoundError } from '../utils/errors';
import { enqueueAllOpportunitiesForScoring } from '../workers/scoringWorker';

const router = Router();
router.use(authenticateJWT, enforceTenantScope);

const ClientSchema = z.object({
  name: z.string().min(1).max(100),
  cage: z.string().optional(),
  uei: z.string().optional(),
  naicsCodes: z.array(z.string()).default([]),
  sdvosb: z.boolean().default(false),
  wosb: z.boolean().default(false),
  hubzone: z.boolean().default(false),
  smallBusiness: z.boolean().default(true),
});

/**
 * GET /api/clients
 */
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const { page = '1', limit = '20', active } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = { consultingFirmId };
    if (active !== undefined) where.isActive = active === 'true';

    const [clients, total] = await Promise.all([
      prisma.clientCompany.findMany({
        where,
        include: { performanceStats: true },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { name: 'asc' },
      }),
      prisma.clientCompany.count({ where }),
    ]);

    res.json({
      success: true,
      data: clients,
      meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/clients
 */
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const body = ClientSchema.parse(req.body);

    const client = await prisma.$transaction(async (tx) => {
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
    enqueueAllOpportunitiesForScoring(consultingFirmId).catch(() => {});

    res.status(201).json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const client = await prisma.clientCompany.findFirst({
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

    if (!client) throw new NotFoundError('ClientCompany');

    res.json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/clients/:id  (ADMIN only)
 */
router.put('/:id', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const existing = await prisma.clientCompany.findFirst({
      where: { id: req.params.id, consultingFirmId },
    });
    if (!existing) throw new NotFoundError('ClientCompany');

    const body = ClientSchema.partial().parse(req.body);
    const updated = await prisma.clientCompany.update({
      where: { id: req.params.id },
      data: body,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/clients/:id (soft delete, ADMIN only)
 */
router.delete('/:id', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const existing = await prisma.clientCompany.findFirst({
      where: { id: req.params.id, consultingFirmId },
    });
    if (!existing) throw new NotFoundError('ClientCompany');

    await prisma.clientCompany.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ success: true, data: { message: 'Client deactivated' } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/clients/:id/stats
 */
router.get('/:id/stats', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req);
    const stats = await prisma.performanceStats.findFirst({
      where: { clientCompany: { id: req.params.id, consultingFirmId } },
      include: { clientCompany: { select: { id: true, name: true } } },
    });

    if (!stats) throw new NotFoundError('PerformanceStats');

    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

export default router;
