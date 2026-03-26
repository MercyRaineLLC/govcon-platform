// =============================================================
// Billing Routes — Subscription plans, invoices, usage
// =============================================================
import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { authenticateJWT, requireRole } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import {
  getOrSeedPlans,
  getOrCreateSubscription,
  getUsage,
  createInvoice,
} from '../services/billingService'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// -------------------------------------------------------------
// GET /api/billing/plans — public plan catalogue
// -------------------------------------------------------------
router.get('/plans', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const plans = await getOrSeedPlans()
    res.json({ plans })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/billing/subscription — current firm subscription + usage
// -------------------------------------------------------------
router.get('/subscription', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const [subscription, usage, firm] = await Promise.all([
      getOrCreateSubscription(consultingFirmId),
      getUsage(consultingFirmId),
      prisma.consultingFirm.findUnique({ where: { id: consultingFirmId }, select: { isVeteranOwned: true } }),
    ])
    const basePrice = Number(subscription.plan.monthlyPriceUsd)
    const veteranDiscount = firm?.isVeteranOwned ? Math.round(basePrice * 0.10 * 100) / 100 : 0
    const effectivePrice = Math.round((basePrice - veteranDiscount) * 100) / 100
    res.json({ subscription, usage, veteranDiscount, effectivePrice, isVeteranOwned: firm?.isVeteranOwned ?? false })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/billing/subscribe — subscribe / change plan (ADMIN)
// -------------------------------------------------------------
router.post('/subscribe', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const { planId, billingCycle } = req.body

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } })
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    const cycle: 'MONTHLY' | 'ANNUAL' = billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
    const now = new Date()
    const periodEnd = cycle === 'ANNUAL'
      ? new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())

    const existing = await prisma.subscription.findUnique({ where: { consultingFirmId } })
    const sub = existing
      ? await prisma.subscription.update({
          where: { consultingFirmId },
          data: { planId, billingCycle: cycle, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, trialEndsAt: null },
          include: { plan: true },
        })
      : await prisma.subscription.create({
          data: { consultingFirmId, planId, billingCycle: cycle, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
          include: { plan: true },
        })

    res.json({ subscription: sub })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// PUT /api/billing/subscription/cancel — cancel at period end
// -------------------------------------------------------------
router.put('/subscription/cancel', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const sub = await prisma.subscription.update({
      where: { consultingFirmId: getTenantId(req) },
      data: { cancelAtPeriodEnd: true },
      include: { plan: true },
    })
    res.json({ subscription: sub })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// PUT /api/billing/subscription/reactivate
// -------------------------------------------------------------
router.put('/subscription/reactivate', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const sub = await prisma.subscription.update({
      where: { consultingFirmId: getTenantId(req) },
      data: { cancelAtPeriodEnd: false, status: 'ACTIVE' },
      include: { plan: true },
    })
    res.json({ subscription: sub })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/billing/invoices
// -------------------------------------------------------------
router.get('/invoices', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Number(req.query.limit) || 20)

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { consultingFirmId },
        include: { lineItems: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where: { consultingFirmId } }),
    ])
    res.json({ invoices, total, page, limit })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// GET /api/billing/invoices/:id
// -------------------------------------------------------------
router.get('/invoices/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, consultingFirmId: getTenantId(req) },
      include: { lineItems: true, subscription: { include: { plan: true } } },
    })
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' })
    res.json({ invoice })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/billing/invoices/generate — create invoice for current period (ADMIN)
// -------------------------------------------------------------
router.post('/invoices/generate', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const consultingFirmId = getTenantId(req)
    const sub = await prisma.subscription.findUnique({
      where: { consultingFirmId },
      include: { plan: true },
    })
    if (!sub) return res.status(400).json({ error: 'No active subscription found' })

    const pricePerMonth = sub.billingCycle === 'ANNUAL'
      ? Number(sub.plan.annualPriceUsd)
      : Number(sub.plan.monthlyPriceUsd)

    const dueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const invoice = await createInvoice(consultingFirmId, sub.id, {
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      dueAt,
      notes: req.body.notes,
      lineItems: [
        {
          description: `${sub.plan.name} Plan — ${sub.billingCycle === 'ANNUAL' ? 'Annual (billed monthly)' : 'Monthly'} subscription`,
          quantity: 1,
          unitPriceUsd: pricePerMonth,
        },
      ],
    })

    res.json({ invoice })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// PUT /api/billing/invoices/:id/status — mark paid / void (ADMIN)
// -------------------------------------------------------------
router.put('/invoices/:id/status', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body
    const allowed = ['PAID', 'VOID', 'OPEN', 'UNCOLLECTIBLE']
    if (!allowed.includes(status)) return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` })

    await prisma.invoice.updateMany({
      where: { id: req.params.id, consultingFirmId: getTenantId(req) },
      data: { status, paidAt: status === 'PAID' ? new Date() : null },
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
