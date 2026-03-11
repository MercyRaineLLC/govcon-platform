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
import { lookupEntityByUEI, lookupEntityByCAGE, lookupEntityByName } from '../services/samEntityApi';

const router = Router();
router.use(authenticateJWT, enforceTenantScope);

const ClientSchema = z.object({
  name: z.string().min(1).max(100),
  cage: z.string().optional(),
  uei: z.string().optional(),
  ein: z.string().optional(),
  naicsCodes: z.array(z.string()).default([]),
  sdvosb: z.boolean().default(false),
  wosb: z.boolean().default(false),
  hubzone: z.boolean().default(false),
  smallBusiness: z.boolean().default(true),
  phone: z.string().optional(),
  website: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  samRegStatus: z.string().optional(),
  samRegExpiry: z.coerce.date().optional(),
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
 * GET /api/clients/lookup?uei=...  OR  ?cage=...  OR  ?name=...
 * Looks up entity data from SAM.gov — does NOT create a record.
 * EIN lookup is NOT supported by the SAM.gov public API.
 */
router.get('/lookup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uei, cage, name } = req.query as Record<string, string>;
    if (!uei && !cage && !name) {
      return res.status(400).json({ success: false, error: 'Provide uei, cage, or name query parameter' });
    }

    let result: any = null;
    if (uei) result = await lookupEntityByUEI(uei);
    else if (cage) result = await lookupEntityByCAGE(cage);
    else if (name) result = await lookupEntityByName(name);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Entity not found in SAM.gov registry. Verify the UEI/CAGE is correct and the entity has an active registration.' });
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(502).json({ success: false, error: err.message || 'SAM.gov lookup failed' });
  }
});

/**
 * GET /api/clients/lookup-raw?uei=...  (Admin — see exact SAM response for debugging)
 */
router.get('/lookup-raw', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const axiosLib = (await import('axios')).default;
    const { uei, cage, name } = req.query as Record<string, string>;
    const apiKey = process.env.SAM_API_KEY;
    const params: Record<string, string> = { api_key: apiKey!, includeSections: 'entityRegistration,coreData,assertions' };
    if (uei)  params.ueiSAM       = uei.trim().toUpperCase();
    else if (cage) params.cageCode = cage.trim().toUpperCase();
    else if (name) { params.legalBusinessName = name.trim(); params.registrationStatus = 'Active'; }
    else return res.status(400).json({ error: 'Provide uei, cage, or name' });

    const samRes = await axiosLib.get('https://api.sam.gov/entity-information/v3/entities', { params, timeout: 20000 });
    res.json({ status: samRes.status, data: samRes.data });
  } catch (err: any) {
    res.json({ error: err.message, responseStatus: err.response?.status, responseData: err.response?.data });
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
