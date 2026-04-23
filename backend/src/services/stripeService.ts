// =============================================================
// Stripe Service — Checkout sessions, webhook handling, audit
// =============================================================
// Compliance: All state transitions logged to ComplianceLog.
// Idempotency: Stripe events deduplicated by event.id (caller's job).
// Tenancy: Always scoped by consultingFirmId from JWT (caller).
// =============================================================

import Stripe from 'stripe'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'

// -------------------------------------------------------------
// Local types — Stripe v22 dropped the Stripe.X namespace pattern,
// so we type only what we consume here. Keeps us decoupled from
// Stripe's internal TypeScript reorganization.
// -------------------------------------------------------------

interface StripeEvent {
  id: string
  type: string
  data: { object: any }
}

interface StripeCheckoutSession {
  id: string
  url: string | null
  amount_total: number | null
  metadata?: { [key: string]: string } | null
}

interface StripeCharge {
  id: string
  amount_refunded: number | null
  metadata?: { [key: string]: string } | null
}

interface StripeSubscription {
  id: string
  status: string
  customer: string
  metadata?: { [key: string]: string } | null
  current_period_end?: number
  cancel_at_period_end?: boolean
}

// -------------------------------------------------------------
// Stripe Client (lazy init — env vars required at first call)
// -------------------------------------------------------------

let stripeClient: any = null

export function getStripe(): any {
  if (stripeClient) return stripeClient

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  stripeClient = new Stripe(key, {
    appInfo: { name: 'MrGovCon BANKV Engine', version: '1.0.0' },
  })

  return stripeClient
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

// -------------------------------------------------------------
// Lifetime Access Pricing (cents)
// -------------------------------------------------------------

export const LIFETIME_PRICE_CENTS = 124900 // $1,249.00
export const LIFETIME_PRODUCT_NAME = 'MrGovCon BANKV Engine — Lifetime Access'

export interface AddOnDefinition {
  slug: string
  name: string
  priceCents: number
  description: string
}

export const ADDON_CATALOG: AddOnDefinition[] = [
  {
    slug: 'state_municipal',
    name: 'State & Municipal Opportunity Feed',
    priceCents: 19900,
    description: 'Add 50-state procurement portal scraping with weekly refresh.',
  },
  {
    slug: 'compliance_matrix_ai',
    name: 'AI Compliance Matrix Generation',
    priceCents: 14900,
    description: 'Auto-extract Section L/M requirements from RFPs using LLM.',
  },
  {
    slug: 'proposal_assist_pro',
    name: 'Proposal Assistant Pro (100 tokens/mo)',
    priceCents: 9900,
    description: 'AI-drafted proposal sections with PDF export.',
  },
]

// -------------------------------------------------------------
// Recurring subscription tiers — Price IDs from Stripe Dashboard
// Each tier maps to a STRIPE_PRICE_<TIER> env var.
// Per engineering.md Rule 5: env-driven so admin can rotate Price IDs
// without code changes.
// -------------------------------------------------------------

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise'

export interface TierDefinition {
  slug: SubscriptionTier
  name: string
  priceEnvVar: string
  description: string
  features: string[]
}

export const TIER_CATALOG: TierDefinition[] = [
  {
    slug: 'starter',
    name: 'Starter',
    priceEnvVar: 'STRIPE_PRICE_STARTER',
    description: 'For solo consultants getting started with federal contracting.',
    features: [
      'Up to 5 client companies',
      '500 opportunity scores per month',
      'BANKV Engine — keyword compliance gap analysis',
      'Email support',
    ],
  },
  {
    slug: 'professional',
    name: 'Professional',
    priceEnvVar: 'STRIPE_PRICE_PROFESSIONAL',
    description: 'For growing consulting firms managing multiple clients.',
    features: [
      'Up to 25 client companies',
      'Unlimited opportunity scoring',
      'AI-powered FAR/DFARS clause extraction',
      'White-label client portal',
      'Email + SMS notifications',
      'Priority email support',
    ],
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    priceEnvVar: 'STRIPE_PRICE_ENTERPRISE',
    description: 'For established firms with custom domain and full automation.',
    features: [
      'Unlimited client companies',
      'Everything in Professional',
      'Custom domain + SSO',
      'Dedicated success manager',
      'Custom integrations',
      'SLA + phone support',
    ],
  },
]

export function getPriceIdForTier(tier: SubscriptionTier): string {
  const def = TIER_CATALOG.find(t => t.slug === tier)
  if (!def) throw new Error(`Unknown subscription tier: ${tier}`)
  const priceId = process.env[def.priceEnvVar]
  if (!priceId) {
    throw new Error(
      `${def.priceEnvVar} is not configured. Create the price in Stripe Dashboard ` +
      `and set the env var to the price_xxx ID.`
    )
  }
  // Reject placeholder values to fail fast
  if (priceId.includes('REPLACE_WITH')) {
    throw new Error(
      `${def.priceEnvVar} contains a placeholder value. Replace it with a real Stripe price_xxx ID.`
    )
  }
  return priceId
}

export function isTierConfigured(tier: SubscriptionTier): boolean {
  try {
    getPriceIdForTier(tier)
    return true
  } catch {
    return false
  }
}

// -------------------------------------------------------------
// Customer creation (idempotent — uses stripeCustomerId on firm)
// -------------------------------------------------------------

export async function getOrCreateCustomer(consultingFirmId: string): Promise<string> {
  const firm = await prisma.consultingFirm.findUnique({
    where: { id: consultingFirmId },
    select: { id: true, name: true, contactEmail: true, stripeCustomerId: true },
  })
  if (!firm) throw new Error('Firm not found')

  if (firm.stripeCustomerId) return firm.stripeCustomerId

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email: firm.contactEmail,
    name: firm.name,
    metadata: { consultingFirmId: firm.id },
  })

  await prisma.consultingFirm.update({
    where: { id: firm.id },
    data: { stripeCustomerId: customer.id },
  })

  logger.info('Stripe customer created', { firmId: firm.id, customerId: customer.id })

  return customer.id
}

// -------------------------------------------------------------
// Lifetime checkout session
// -------------------------------------------------------------

export async function createLifetimeCheckoutSession(opts: {
  consultingFirmId: string
  successUrl: string
  cancelUrl: string
}): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe()
  const customerId = await getOrCreateCustomer(opts.consultingFirmId)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: LIFETIME_PRICE_CENTS,
          product_data: {
            name: LIFETIME_PRODUCT_NAME,
            description: 'One-time payment for lifetime platform access. Add-ons billed separately.',
          },
        },
        quantity: 1,
      },
    ],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      consultingFirmId: opts.consultingFirmId,
      productType: 'lifetime',
    },
    payment_intent_data: {
      metadata: {
        consultingFirmId: opts.consultingFirmId,
        productType: 'lifetime',
      },
    },
  })

  if (!session.url) {
    throw new Error('Stripe checkout session has no URL')
  }

  logger.info('Stripe checkout session created', {
    firmId: opts.consultingFirmId,
    sessionId: session.id,
    productType: 'lifetime',
  })

  return { sessionId: session.id, url: session.url }
}

// -------------------------------------------------------------
// Add-on checkout session
// -------------------------------------------------------------

export async function createAddOnCheckoutSession(opts: {
  consultingFirmId: string
  addonSlug: string
  successUrl: string
  cancelUrl: string
}): Promise<{ sessionId: string; url: string }> {
  const addon = ADDON_CATALOG.find(a => a.slug === opts.addonSlug)
  if (!addon) throw new Error(`Unknown addon: ${opts.addonSlug}`)

  const stripe = getStripe()
  const customerId = await getOrCreateCustomer(opts.consultingFirmId)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: addon.priceCents,
          product_data: {
            name: addon.name,
            description: addon.description,
          },
        },
        quantity: 1,
      },
    ],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      consultingFirmId: opts.consultingFirmId,
      productType: 'addon',
      addonSlug: addon.slug,
    },
  })

  if (!session.url) {
    throw new Error('Stripe checkout session has no URL')
  }

  logger.info('Stripe addon checkout created', {
    firmId: opts.consultingFirmId,
    sessionId: session.id,
    addonSlug: addon.slug,
  })

  return { sessionId: session.id, url: session.url }
}

// -------------------------------------------------------------
// Recurring subscription checkout (Starter / Professional / Enterprise)
// Uses Stripe Price IDs from STRIPE_PRICE_<TIER> env vars.
// Mode: 'subscription' creates a Stripe Subscription on payment success.
// -------------------------------------------------------------

export async function createSubscriptionCheckoutSession(opts: {
  consultingFirmId: string
  tier: SubscriptionTier
  successUrl: string
  cancelUrl: string
}): Promise<{ sessionId: string; url: string }> {
  const priceId = getPriceIdForTier(opts.tier) // throws if not configured
  const stripe = getStripe()
  const customerId = await getOrCreateCustomer(opts.consultingFirmId)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      consultingFirmId: opts.consultingFirmId,
      productType: 'subscription',
      tier: opts.tier,
    },
    subscription_data: {
      metadata: {
        consultingFirmId: opts.consultingFirmId,
        productType: 'subscription',
        tier: opts.tier,
      },
    },
  })

  if (!session.url) {
    throw new Error('Stripe checkout session has no URL')
  }

  logger.info('Stripe subscription checkout created', {
    firmId: opts.consultingFirmId,
    sessionId: session.id,
    tier: opts.tier,
  })

  return { sessionId: session.id, url: session.url }
}

// -------------------------------------------------------------
// Customer Portal session — lets customers manage their subscription
// (update card, cancel, view invoices) without leaving Stripe.
// -------------------------------------------------------------

export async function createCustomerPortalSession(opts: {
  consultingFirmId: string
  returnUrl: string
}): Promise<{ url: string }> {
  const firm = await prisma.consultingFirm.findUnique({
    where: { id: opts.consultingFirmId },
    select: { stripeCustomerId: true },
  })
  if (!firm?.stripeCustomerId) {
    throw new Error('Firm has no Stripe customer record yet — purchase something first')
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: firm.stripeCustomerId,
    return_url: opts.returnUrl,
  })

  logger.info('Stripe customer portal session created', {
    firmId: opts.consultingFirmId,
    sessionId: session.id,
  })

  return { url: session.url }
}

// -------------------------------------------------------------
// Webhook signature verification
// -------------------------------------------------------------

export function verifyWebhookSignature(payload: Buffer, signature: string): StripeEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }
  return getStripe().webhooks.constructEvent(payload, signature, secret) as StripeEvent
}

// -------------------------------------------------------------
// Webhook event handler
// Idempotent: each event applied once by event.id
// All state changes logged to ComplianceLog
// -------------------------------------------------------------

export async function handleWebhookEvent(event: StripeEvent): Promise<{ processed: boolean; reason?: string }> {
  // Idempotency: skip if we've seen this event before
  const existing = await prisma.complianceLog.findFirst({
    where: { entityType: 'OTHER', entityId: event.id },
    select: { id: true },
  }).catch(() => null)
  if (existing) {
    logger.info('Stripe webhook already processed', { eventId: event.id })
    return { processed: false, reason: 'already_processed' }
  }

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event)

    case 'charge.refunded':
      return handleRefund(event)

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return handleSubscriptionUpsert(event)

    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event)

    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event)

    default:
      logger.info('Stripe webhook received (no handler)', { eventId: event.id, type: event.type })
      return { processed: false, reason: 'no_handler' }
  }
}

async function handleCheckoutCompleted(event: StripeEvent): Promise<{ processed: boolean }> {
  const session = event.data.object as StripeCheckoutSession
  const consultingFirmId = session.metadata?.consultingFirmId
  const productType = session.metadata?.productType

  if (!consultingFirmId) {
    logger.error('Stripe checkout completed without firmId metadata', { eventId: event.id })
    return { processed: false }
  }

  const firm = await prisma.consultingFirm.findUnique({
    where: { id: consultingFirmId },
    select: { id: true, purchasedAddons: true, lifetimeAccessAt: true },
  })
  if (!firm) {
    logger.error('Stripe checkout for unknown firm', { firmId: consultingFirmId, eventId: event.id })
    return { processed: false }
  }

  if (productType === 'lifetime') {
    await prisma.consultingFirm.update({
      where: { id: consultingFirmId },
      data: { lifetimeAccessAt: firm.lifetimeAccessAt ?? new Date() },
    })
  } else if (productType === 'addon') {
    const addonSlug = session.metadata?.addonSlug
    if (addonSlug && !firm.purchasedAddons.includes(addonSlug)) {
      await prisma.consultingFirm.update({
        where: { id: consultingFirmId },
        data: { purchasedAddons: { push: addonSlug } },
      })
    }
  } else if (productType === 'subscription') {
    // Subscription created — Stripe will also fire customer.subscription.created
    // which is the canonical place to capture stripeSubscriptionId. We just
    // log here for the audit trail. Tier metadata is on the subscription too.
    logger.info('Subscription checkout completed (subscription event will follow)', {
      firmId: consultingFirmId,
      tier: session.metadata?.tier,
      sessionId: session.id,
    })
  }

  // Audit trail (compliance + idempotency marker)
  await prisma.complianceLog.create({
    data: {
      consultingFirmId,
      entityType: 'OTHER',
      entityId: event.id, // doubles as idempotency key
      fromStatus: 'PENDING',
      toStatus: 'COMPLETED',
      reason: `Stripe checkout completed: ${productType}${session.metadata?.addonSlug ? ` (${session.metadata.addonSlug})` : ''} — $${(session.amount_total ?? 0) / 100}`,
      triggeredBy: `stripe-webhook:${session.id}`,
    },
  })

  logger.info('Stripe checkout processed', {
    firmId: consultingFirmId,
    productType,
    sessionId: session.id,
    amount: session.amount_total,
  })

  return { processed: true }
}

async function handleRefund(event: StripeEvent): Promise<{ processed: boolean }> {
  const charge = event.data.object as StripeCharge
  const consultingFirmId = charge.metadata?.consultingFirmId
  if (!consultingFirmId) {
    logger.warn('Stripe refund without firmId metadata', { eventId: event.id })
    return { processed: false }
  }

  await prisma.complianceLog.create({
    data: {
      consultingFirmId,
      entityType: 'OTHER',
      entityId: event.id,
      fromStatus: 'COMPLETED',
      toStatus: 'REFUNDED',
      reason: `Stripe refund processed — $${(charge.amount_refunded ?? 0) / 100}`,
      triggeredBy: `stripe-webhook:${charge.id}`,
    },
  })

  logger.info('Stripe refund logged', { firmId: consultingFirmId, chargeId: charge.id })
  return { processed: true }
}

// -------------------------------------------------------------
// Subscription lifecycle handlers
// customer.subscription.created — subscription just created
// customer.subscription.updated — plan change, period renewal, status change
// -------------------------------------------------------------

async function handleSubscriptionUpsert(event: StripeEvent): Promise<{ processed: boolean }> {
  const sub = event.data.object as StripeSubscription
  const consultingFirmId = sub.metadata?.consultingFirmId
  if (!consultingFirmId) {
    logger.warn('Stripe subscription event without firmId metadata', { eventId: event.id, subId: sub.id })
    return { processed: false }
  }

  const firm = await prisma.consultingFirm.findUnique({
    where: { id: consultingFirmId },
    select: { id: true, stripeSubscriptionId: true },
  })
  if (!firm) {
    logger.error('Stripe subscription for unknown firm', { firmId: consultingFirmId, subId: sub.id })
    return { processed: false }
  }

  // Persist stripeSubscriptionId (idempotent — same value on updates)
  if (firm.stripeSubscriptionId !== sub.id) {
    await prisma.consultingFirm.update({
      where: { id: consultingFirmId },
      data: { stripeSubscriptionId: sub.id },
    })
  }

  await prisma.complianceLog.create({
    data: {
      consultingFirmId,
      entityType: 'OTHER',
      entityId: event.id,
      fromStatus: 'PENDING',
      toStatus: sub.status.toUpperCase(),
      reason: `Stripe subscription ${event.type.split('.').pop()}: tier=${sub.metadata?.tier ?? 'unknown'} status=${sub.status} cancelAtPeriodEnd=${sub.cancel_at_period_end ?? false}`,
      triggeredBy: `stripe-webhook:${sub.id}`,
    },
  })

  logger.info('Subscription event processed', {
    firmId: consultingFirmId,
    subId: sub.id,
    status: sub.status,
    tier: sub.metadata?.tier,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  })
  return { processed: true }
}

async function handleSubscriptionDeleted(event: StripeEvent): Promise<{ processed: boolean }> {
  const sub = event.data.object as StripeSubscription
  const consultingFirmId = sub.metadata?.consultingFirmId
  if (!consultingFirmId) {
    logger.warn('Stripe subscription deleted without firmId metadata', { eventId: event.id, subId: sub.id })
    return { processed: false }
  }

  // Clear stripeSubscriptionId so a new subscription can be created
  await prisma.consultingFirm.update({
    where: { id: consultingFirmId },
    data: { stripeSubscriptionId: null },
  }).catch(() => {})

  await prisma.complianceLog.create({
    data: {
      consultingFirmId,
      entityType: 'OTHER',
      entityId: event.id,
      fromStatus: 'ACTIVE',
      toStatus: 'CANCELED',
      reason: `Stripe subscription deleted: tier=${sub.metadata?.tier ?? 'unknown'}`,
      triggeredBy: `stripe-webhook:${sub.id}`,
    },
  })

  logger.info('Subscription deleted', { firmId: consultingFirmId, subId: sub.id })
  return { processed: true }
}

async function handleInvoicePaymentFailed(event: StripeEvent): Promise<{ processed: boolean }> {
  const invoice = event.data.object as { id: string; customer: string; subscription?: string; amount_due?: number }
  // Look up firm via customer ID (invoice metadata not always present)
  const firm = await prisma.consultingFirm.findFirst({
    where: { stripeCustomerId: invoice.customer },
    select: { id: true },
  })
  if (!firm) {
    logger.warn('Invoice payment failed for unknown customer', { customerId: invoice.customer })
    return { processed: false }
  }

  await prisma.complianceLog.create({
    data: {
      consultingFirmId: firm.id,
      entityType: 'OTHER',
      entityId: event.id,
      fromStatus: 'ACTIVE',
      toStatus: 'PAST_DUE',
      reason: `Invoice payment failed — $${(invoice.amount_due ?? 0) / 100}`,
      triggeredBy: `stripe-webhook:${invoice.id}`,
    },
  })

  logger.warn('Subscription invoice payment failed', {
    firmId: firm.id,
    invoiceId: invoice.id,
    amount: invoice.amount_due,
  })
  return { processed: true }
}

// -------------------------------------------------------------
// Read access — does firm have lifetime access?
// -------------------------------------------------------------

export async function hasLifetimeAccess(consultingFirmId: string): Promise<boolean> {
  const firm = await prisma.consultingFirm.findUnique({
    where: { id: consultingFirmId },
    select: { lifetimeAccessAt: true },
  })
  return Boolean(firm?.lifetimeAccessAt)
}
