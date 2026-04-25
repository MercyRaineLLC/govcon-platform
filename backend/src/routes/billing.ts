// =============================================================
// Billing Routes — Subscription plans, invoices, usage, Stripe checkout
// =============================================================
import { Router, Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { authenticateJWT, requireRole } from '../middleware/auth'
import { enforceTenantScope, getTenantId } from '../middleware/tenant'
import { ValidationError, NotFoundError } from '../utils/errors'
import {
  getOrSeedPlans,
  getOrCreateSubscription,
  getUsage,
  createInvoice,
} from '../services/billingService'
import {
  createLifetimeCheckoutSession,
  createAddOnCheckoutSession,
  createSubscriptionCheckoutSession,
  createTokenPackCheckoutSession,
  createCustomerPortalSession,
  isStripeConfigured,
  hasLifetimeAccess,
  ADDON_CATALOG,
  LIFETIME_PRICE_CENTS,
  LIFETIME_PRODUCT_NAME,
  LIFETIME_MAX_SLOTS,
  TIER_CATALOG,
  isTierConfigured,
  SubscriptionTier,
} from '../services/stripeService'
import { TOKEN_PACK_SLUGS, TOKEN_PACK_PRICE_CENTS, TOKEN_PACK_ADDONS } from '../config/addons'

const router = Router()
router.use(authenticateJWT, enforceTenantScope)

// -------------------------------------------------------------
// GET /api/billing/plans — public plan catalogue
// -------------------------------------------------------------
router.get('/plans', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const plans = await getOrSeedPlans()
    // Legacy contract preserved (frontend Billing.tsx depends on top-level shape)
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
    const lifetimeAccess = await hasLifetimeAccess(consultingFirmId)
    // Legacy top-level shape preserved + new field appended
    res.json({
      subscription,
      usage,
      veteranDiscount,
      effectivePrice,
      isVeteranOwned: firm?.isVeteranOwned ?? false,
      hasLifetimeAccess: lifetimeAccess,
    })
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
    if (!plan) throw new NotFoundError('Plan not found')

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
    if (!invoice) throw new NotFoundError('Invoice not found')
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
    if (!sub) throw new ValidationError('No active subscription found')

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
    if (!allowed.includes(status)) throw new ValidationError(`Status must be one of: ${allowed.join(', ')}`)

    await prisma.invoice.updateMany({
      where: { id: req.params.id, consultingFirmId: getTenantId(req) },
      data: { status, paidAt: status === 'PAID' ? new Date() : null },
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// =============================================================
// STRIPE CHECKOUT — Lifetime access + add-ons
// New endpoints follow standard contract: { success, data, error?, code? }
// =============================================================

// -------------------------------------------------------------
// GET /api/billing/stripe/catalog — public catalog (no Stripe call)
// -------------------------------------------------------------
router.get('/stripe/catalog', async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: {
        configured: isStripeConfigured(),
        lifetime: {
          name: LIFETIME_PRODUCT_NAME,
          priceCents: LIFETIME_PRICE_CENTS,
          priceUsd: LIFETIME_PRICE_CENTS / 100,
        },
        addons: ADDON_CATALOG.map(a => ({
          slug: a.slug,
          name: a.name,
          priceCents: a.priceCents,
          priceUsd: a.priceCents / 100,
          description: a.description,
        })),
        // Recurring subscription tiers — only listed if STRIPE_PRICE_<TIER> is set
        tiers: TIER_CATALOG.map(t => ({
          slug: t.slug,
          name: t.name,
          description: t.description,
          features: t.features,
          configured: isTierConfigured(t.slug),
        })),
      },
    })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/billing/stripe/checkout/lifetime — start lifetime purchase
// Body: { successUrl, cancelUrl }
// -------------------------------------------------------------
router.post('/stripe/checkout/lifetime', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isStripeConfigured()) throw new ValidationError('Stripe is not configured on this server')

    const { successUrl, cancelUrl } = req.body
    if (!successUrl || !cancelUrl) throw new ValidationError('successUrl and cancelUrl are required')

    const consultingFirmId = getTenantId(req)

    // Idempotency: skip if firm already has lifetime access
    if (await hasLifetimeAccess(consultingFirmId)) {
      throw new ValidationError('Firm already has lifetime access')
    }

    // Cap: only 10 founders lifetime slots total
    const claimed = await prisma.consultingFirm.count({ where: { lifetimeAccessAt: { not: null } } })
    if (claimed >= LIFETIME_MAX_SLOTS) {
      throw new ValidationError(`All ${LIFETIME_MAX_SLOTS} founders lifetime slots have been claimed`)
    }

    const session = await createLifetimeCheckoutSession({
      consultingFirmId,
      successUrl,
      cancelUrl,
    })

    res.json({ success: true, data: session })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/billing/stripe/checkout/addon — start add-on purchase
// Body: { addonSlug, successUrl, cancelUrl }
// -------------------------------------------------------------
router.post('/stripe/checkout/addon', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isStripeConfigured()) throw new ValidationError('Stripe is not configured on this server')

    const { addonSlug, successUrl, cancelUrl } = req.body
    if (!addonSlug || !successUrl || !cancelUrl) {
      throw new ValidationError('addonSlug, successUrl, and cancelUrl are required')
    }

    const consultingFirmId = getTenantId(req)

    // Idempotency: skip if firm already owns this addon
    const firm = await prisma.consultingFirm.findUnique({
      where: { id: consultingFirmId },
      select: { purchasedAddons: true },
    })
    if (firm?.purchasedAddons.includes(addonSlug)) {
      throw new ValidationError('Firm already owns this add-on')
    }

    const session = await createAddOnCheckoutSession({
      consultingFirmId,
      addonSlug,
      successUrl,
      cancelUrl,
    })

    res.json({ success: true, data: session })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/billing/stripe/checkout/subscription — start recurring sub
// Body: { tier: 'starter'|'professional'|'enterprise' }
// successUrl/cancelUrl optional — defaults to APP_URL/billing
// -------------------------------------------------------------
router.post('/stripe/checkout/subscription', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isStripeConfigured()) throw new ValidationError('Stripe is not configured on this server')

    const { tier, successUrl, cancelUrl } = req.body
    const validTiers: SubscriptionTier[] = ['starter', 'professional', 'enterprise']
    if (!validTiers.includes(tier)) {
      throw new ValidationError(`tier must be one of: ${validTiers.join(', ')}`)
    }
    if (!isTierConfigured(tier)) {
      throw new ValidationError(`Subscription tier '${tier}' is not configured (set STRIPE_PRICE_${tier.toUpperCase()} in env)`)
    }

    const consultingFirmId = getTenantId(req)
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    const session = await createSubscriptionCheckoutSession({
      consultingFirmId,
      tier,
      successUrl: successUrl || `${appUrl}/billing?checkout=success&tier=${tier}`,
      cancelUrl: cancelUrl || `${appUrl}/billing?checkout=canceled`,
    })

    res.json({ success: true, data: session })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/billing/stripe/checkout/token-pack — buy a token pack
// Body: { slug: 'proposal_tokens_15' | 'proposal_tokens_40' | 'proposal_tokens_120' }
// successUrl/cancelUrl optional — defaults to APP_URL/billing
// -------------------------------------------------------------
router.post('/stripe/checkout/token-pack', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isStripeConfigured()) throw new ValidationError('Stripe is not configured on this server')

    const { slug, successUrl, cancelUrl } = req.body
    if (typeof slug !== 'string' || !TOKEN_PACK_SLUGS[slug]) {
      throw new ValidationError(`slug must be one of: ${Object.keys(TOKEN_PACK_SLUGS).join(', ')}`)
    }

    const tokenAmount = TOKEN_PACK_SLUGS[slug]
    const priceCents = TOKEN_PACK_PRICE_CENTS[slug]
    const pack = TOKEN_PACK_ADDONS.find(p => p.slug === slug)
    if (!priceCents || !pack) throw new ValidationError(`Token pack '${slug}' has no price configured`)

    const consultingFirmId = getTenantId(req)
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    const session = await createTokenPackCheckoutSession({
      consultingFirmId,
      packSlug: slug,
      packName: pack.name,
      tokenAmount,
      priceCents,
      successUrl: successUrl || `${appUrl}/billing?checkout=success&pack=${slug}`,
      cancelUrl: cancelUrl || `${appUrl}/billing?checkout=canceled`,
    })

    res.json({ success: true, data: session })
  } catch (err) { next(err) }
})

// -------------------------------------------------------------
// POST /api/billing/stripe/portal — open Stripe Customer Portal
// Body: { returnUrl? }
// Customer can manage subscription, update card, view invoices.
// -------------------------------------------------------------
router.post('/stripe/portal', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!isStripeConfigured()) throw new ValidationError('Stripe is not configured on this server')

    const consultingFirmId = getTenantId(req)
    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    const session = await createCustomerPortalSession({
      consultingFirmId,
      returnUrl: req.body.returnUrl || `${appUrl}/billing`,
    })

    res.json({ success: true, data: session })
  } catch (err) { next(err) }
})

export default router
