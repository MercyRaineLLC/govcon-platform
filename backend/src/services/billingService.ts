import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'

// ──────────────────────────────────────────────────────────────
// Default plan catalogue — seeded on first call to getOrSeedPlans
// ──────────────────────────────────────────────────────────────
const DEFAULT_PLANS = [
  {
    slug: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 299,
    annualPriceUsd: 254,   // ~15% annual discount
    maxUsers: 3,
    maxClients: 5,
    aiCallsPerMonth: 200,
    features: [
      'SAM.gov opportunity ingestion',
      'AI document analysis',
      'Compliance matrix generation',
      'Client portal',
      'Basic analytics dashboard',
      'Up to 3 users',
      'Up to 5 active clients',
    ],
    sortOrder: 1,
  },
  {
    slug: 'professional',
    name: 'Professional',
    monthlyPriceUsd: 599,
    annualPriceUsd: 509,   // ~15% annual discount
    maxUsers: 10,
    maxClients: 25,
    aiCallsPerMonth: 2000,
    features: [
      'Everything in Starter',
      'Multi-provider AI (Claude, OpenAI, Insight Engine, LocalAI)',
      'Revenue forecasting & Monte Carlo simulation',
      'Market intelligence & NAICS trend analysis',
      'Rewards program',
      'Template library',
      'Bid guidance generation',
      'Up to 10 users',
      'Up to 25 active clients',
    ],
    sortOrder: 2,
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUsd: 1499,
    annualPriceUsd: 1274,  // ~15% annual discount
    maxUsers: -1,
    maxClients: -1,
    aiCallsPerMonth: -1,
    features: [
      'Everything in Professional',
      'Unlimited users & clients',
      'Unlimited AI calls',
      'Custom integrations',
      'Dedicated account manager',
      'Priority support & SLA',
      'White-label client portal',
      'Dedicated onboarding',
    ],
    sortOrder: 3,
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
  const pro = plans.find((p) => p.slug === 'professional') ?? plans[0]
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
