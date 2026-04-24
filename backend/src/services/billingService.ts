import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'

// ──────────────────────────────────────────────────────────────
// Default plan catalogue — seeded on first call to getOrSeedPlans
// ──────────────────────────────────────────────────────────────
const DEFAULT_PLANS = [
  {
    slug: 'beta_lifetime',
    name: 'Founders Lifetime Access',
    monthlyPriceUsd: 2500,
    annualPriceUsd: 2500,
    maxUsers: 8,
    maxClients: 30,
    aiCallsPerMonth: 500,
    features: [
      'LIFETIME ACCESS — one-time $2,500 payment, never expires (limited to 10 founders)',
      'Professional tier base features included',
      'AI bid strategy & win guidance',
      'Full analytics suite — market intel, revenue forecast, portfolio health',
      'Client portal with login access',
      'Rewards & compliance incentive program',
      'Contract vehicle detection & matching',
      'Template library access',
      'Up to 8 users · Up to 30 clients',
      'Founding Member badge & priority support',
      'Locked-in access to all future base features',
      'Marketplace add-ons available for purchase separately',
    ],
    sortOrder: 0,
  },
  {
    slug: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 299,
    annualPriceUsd: 254,
    maxUsers: 3,
    maxClients: 10,
    aiCallsPerMonth: 100,
    features: [
      'SAM.gov contract sync',
      'Opportunity scoring & probability engine',
      'Basic dashboard & KPI tracking',
      'AI compliance matrix generation',
      'Client management (up to 10)',
      'Document uploads & analysis',
      'Up to 3 users',
    ],
    sortOrder: 1,
  },
  {
    slug: 'professional',
    name: 'Professional',
    monthlyPriceUsd: 699,
    annualPriceUsd: 594,
    maxUsers: 8,
    maxClients: 30,
    aiCallsPerMonth: 500,
    features: [
      'Everything in Starter',
      'AI bid strategy & win guidance',
      'Full analytics — market intelligence, revenue forecast, portfolio health',
      'Client portal with login access',
      'Rewards & compliance incentive program',
      'Contract vehicle detection & matching',
      'Template library access',
      'Up to 8 users · Up to 30 clients',
    ],
    sortOrder: 2,
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUsd: 1000,
    annualPriceUsd: 850,
    maxUsers: -1,
    maxClients: -1,
    aiCallsPerMonth: -1,
    features: [
      'Everything in Professional',
      'Unlimited users & clients',
      'Unlimited AI calls',
      'Deep market intelligence (USAspending historical data)',
      'White-label client portal',
      'API access',
      'Priority support & dedicated SLA',
      'Custom NAICS configurations',
      'Dedicated onboarding & account manager',
    ],
    sortOrder: 3,
  },
  {
    slug: 'elite',
    name: 'Business Professional Enterprise',
    monthlyPriceUsd: 4500,
    annualPriceUsd: 3825,  // 15% annual discount
    maxUsers: -1,
    maxClients: -1,
    aiCallsPerMonth: -1,
    features: [
      'Everything in Enterprise',
      'All add-ons included — Proposal Assistant, Competitor Intel, Auto Sync & more',
      'Custom AI model tuning on your firm\'s historical data',
      'Dedicated private infrastructure — your data never shared',
      'White-glove onboarding (16 hours)',
      'Quarterly strategic reviews with senior advisor',
      'Priority hotline — 4-hour response SLA',
      'Custom agency & NAICS profiling',
      'Multi-firm portfolio management',
    ],
    sortOrder: 4,
  },
]

export async function getOrSeedPlans() {
  // Upsert on slug so price/feature changes in code are always reflected in DB
  for (const p of DEFAULT_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        monthlyPriceUsd: new Prisma.Decimal(p.monthlyPriceUsd),
        annualPriceUsd: new Prisma.Decimal(p.annualPriceUsd),
        maxUsers: p.maxUsers,
        maxClients: p.maxClients,
        aiCallsPerMonth: p.aiCallsPerMonth,
        features: p.features,
        sortOrder: p.sortOrder,
      },
      create: {
        slug: p.slug,
        name: p.name,
        monthlyPriceUsd: new Prisma.Decimal(p.monthlyPriceUsd),
        annualPriceUsd: new Prisma.Decimal(p.annualPriceUsd),
        maxUsers: p.maxUsers,
        maxClients: p.maxClients,
        aiCallsPerMonth: p.aiCallsPerMonth,
        features: p.features,
        sortOrder: p.sortOrder,
      },
    })
  }
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

// Auto-creates a 14-day Professional trial if no subscription exists
export async function getOrCreateSubscription(consultingFirmId: string) {
  const existing = await prisma.subscription.findUnique({
    where: { consultingFirmId },
    include: { plan: true },
  })
  if (existing) return existing

  const plans = await getOrSeedPlans()
  const pro = plans.find((p) => p.slug === 'beta_lifetime') ?? plans.find((p) => p.slug === 'starter') ?? plans[0]
  const now = new Date()
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  return prisma.subscription.create({
    data: {
      consultingFirmId,
      planId: pro.id,
      status: 'TRIALING',
      billingCycle: 'MONTHLY',
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
      trialEndsAt: trialEnd,
    },
    include: { plan: true },
  })
}

// Monthly token allocation per tier (base allocation — every subscriber gets these)
const BASE_TOKENS_BY_TIER: Record<string, number> = {
  starter:        5,
  beta_lifetime:  15,
  professional:   15,
  enterprise:     30,
  elite:          100,
}

// Bonus tokens when firm has proposal_assistant add-on (stacks on top of base)
const ADDON_BONUS_TOKENS: Record<string, number> = {
  starter:        10,
  beta_lifetime:  15,
  professional:   15,
  enterprise:     25,
  elite:          0, // Elite already includes everything
}

// One-time initial token grant for lifetime buyers
const LIFETIME_INITIAL_GRANT = 200

/** Called after plan change or proposal_assistant add-on purchase to grant the monthly allocation. */
export async function refreshProposalTokens(consultingFirmId: string, planSlug: string): Promise<void> {
  const firm = await prisma.consultingFirm.findUnique({
    where: { id: consultingFirmId },
    select: { purchasedAddons: true, proposalTokens: true },
  })
  const hasProposalAddon = firm?.purchasedAddons.includes('proposal_assistant') ?? false
  const base = BASE_TOKENS_BY_TIER[planSlug] ?? 0
  const bonus = hasProposalAddon ? (ADDON_BONUS_TOKENS[planSlug] ?? 0) : 0
  const tokens = base + bonus
  await prisma.consultingFirm.update({
    where: { id: consultingFirmId },
    data: { proposalTokens: tokens, lastTokenRefreshAt: new Date() },
  })
}

/** Activate a lifetime subscription — called after one-time payment confirmation */
export async function activateLifetime(consultingFirmId: string) {
  const plans = await getOrSeedPlans()
  const betaPlan = plans.find((p) => p.slug === 'beta_lifetime')
  if (!betaPlan) throw new Error('Beta lifetime plan not found')

  const now = new Date()
  const lifetime = new Date(now.getFullYear() + 99, now.getMonth(), now.getDate())

  const sub = await prisma.subscription.upsert({
    where: { consultingFirmId },
    update: {
      planId: betaPlan.id,
      status: 'ACTIVE',
      billingCycle: 'ANNUAL',
      currentPeriodStart: now,
      currentPeriodEnd: lifetime,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
    },
    create: {
      consultingFirmId,
      planId: betaPlan.id,
      status: 'ACTIVE',
      billingCycle: 'ANNUAL',
      currentPeriodStart: now,
      currentPeriodEnd: lifetime,
    },
    include: { plan: true },
  })
  // Lifetime buyers get a generous initial token grant instead of the standard monthly refresh
  await prisma.consultingFirm.update({
    where: { id: consultingFirmId },
    data: { proposalTokens: LIFETIME_INITIAL_GRANT, lastTokenRefreshAt: new Date() },
  })
  return sub
}

export async function getUsage(consultingFirmId: string) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [clients, users, aiCalls] = await Promise.all([
    prisma.clientCompany.count({ where: { consultingFirmId, isActive: true } }),
    prisma.user.count({ where: { consultingFirmId, isActive: true } }),
    prisma.apiUsageLog.count({
      where: { consultingFirmId, cacheHit: false, createdAt: { gte: monthStart } },
    }),
  ])
  return { clients, users, aiCalls }
}

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const count = await prisma.invoice.count({ where: { invoiceNumber: { startsWith: prefix } } })
  return `${prefix}${String(count + 1).padStart(4, '0')}`
}

export async function createInvoice(
  consultingFirmId: string,
  subscriptionId: string,
  opts: {
    periodStart: Date
    periodEnd: Date
    dueAt: Date
    notes?: string
    lineItems: Array<{ description: string; quantity: number; unitPriceUsd: number }>
  }
) {
  const invoiceNumber = await generateInvoiceNumber()
  const subtotal = opts.lineItems.reduce((s, li) => s + li.quantity * li.unitPriceUsd, 0)

  return prisma.invoice.create({
    data: {
      consultingFirmId,
      subscriptionId,
      invoiceNumber,
      status: 'OPEN',
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      dueAt: opts.dueAt,
      subtotalUsd: new Prisma.Decimal(subtotal),
      taxUsd: new Prisma.Decimal(0),
      totalUsd: new Prisma.Decimal(subtotal),
      notes: opts.notes,
      lineItems: {
        create: opts.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPriceUsd: new Prisma.Decimal(li.unitPriceUsd),
          totalUsd: new Prisma.Decimal(li.quantity * li.unitPriceUsd),
        })),
      },
    },
    include: { lineItems: true },
  })
}
