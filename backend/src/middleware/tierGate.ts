import { Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { getTenantId } from './tenant'

// Feature slugs gated per tier
const PROFESSIONAL_FEATURES = ['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library']
const ENTERPRISE_FEATURES  = [...PROFESSIONAL_FEATURES, 'deep_market_intel', 'white_label', 'api_access']

const TIER_FEATURES: Record<string, Set<string>> = {
  starter:        new Set(['compliance_matrix', 'opportunity_scoring', 'dashboard']),
  beta_lifetime:  new Set(PROFESSIONAL_FEATURES),
  professional:   new Set(PROFESSIONAL_FEATURES),
  enterprise:     new Set(ENTERPRISE_FEATURES),
  elite:          new Set(ENTERPRISE_FEATURES),
}

// Max tracked opportunities per tier (enforced on ingest)
export const TIER_OPP_LIMITS: Record<string, number> = {
  starter: 150,
  beta_lifetime: 750,
  professional: 750,
  enterprise: -1,
  elite: -1,
}

export async function getFirmPlan(consultingFirmId: string): Promise<{ slug: string; maxUsers: number; maxClients: number; aiCallsPerMonth: number }> {
  const sub = await prisma.subscription.findUnique({
    where: { consultingFirmId },
    include: { plan: true },
  })
  if (!sub || sub.status === 'CANCELED') {
    return { slug: 'starter', maxUsers: 3, maxClients: 10, aiCallsPerMonth: 100 }
  }
  return {
    slug: sub.plan.slug,
    maxUsers: sub.plan.maxUsers,
    maxClients: sub.plan.maxClients,
    aiCallsPerMonth: sub.plan.aiCallsPerMonth,
  }
}

export async function hasFeature(consultingFirmId: string, feature: string): Promise<boolean> {
  const plan = await getFirmPlan(consultingFirmId)
  return TIER_FEATURES[plan.slug]?.has(feature) ?? false
}

// Express middleware factory — gates a route behind a feature flag
export function requireFeature(feature: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const consultingFirmId = getTenantId(req)
      const allowed = await hasFeature(consultingFirmId, feature)
      if (!allowed) {
        return res.status(403).json({
          error: 'TIER_LIMIT',
          message: `This feature requires a higher subscription tier. Upgrade your plan to access ${feature.replace(/_/g, ' ')}.`,
          feature,
        })
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Check if firm is within client limit
export async function checkClientLimit(consultingFirmId: string): Promise<{ allowed: boolean; current: number; max: number }> {
  const [plan, current] = await Promise.all([
    getFirmPlan(consultingFirmId),
    prisma.clientCompany.count({ where: { consultingFirmId, isActive: true } }),
  ])
  if (plan.maxClients === -1) return { allowed: true, current, max: -1 }
  return { allowed: current < plan.maxClients, current, max: plan.maxClients }
}

// ---------------------------------------------------------------
// Proposal Token System
// ---------------------------------------------------------------

// Monthly base token allocation by tier (every subscriber gets these)
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
  elite:          0,
}

// Refresh tokens if it's a new calendar month (lazy refresh — no cron needed)
// Adds the monthly allocation ON TOP of any remaining purchased tokens
async function maybeRefreshTokens(consultingFirmId: string): Promise<void> {
  const firm = await prisma.consultingFirm.findUnique({
    where: { id: consultingFirmId },
    select: { lastTokenRefreshAt: true, purchasedAddons: true, proposalTokens: true },
  })
  if (!firm) return

  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  if (firm.lastTokenRefreshAt && firm.lastTokenRefreshAt >= thisMonth) return

  const plan = await getFirmPlan(consultingFirmId)
  const hasProposalAddon = firm.purchasedAddons.includes('proposal_assistant')
  const base = BASE_TOKENS_BY_TIER[plan.slug] ?? 0
  const bonus = hasProposalAddon ? (ADDON_BONUS_TOKENS[plan.slug] ?? 0) : 0
  const monthlyGrant = base + bonus

  // Set to the monthly grant (don't stack infinitely — cap at grant + any purchased surplus)
  const newBalance = Math.max(firm.proposalTokens, monthlyGrant)

  await prisma.consultingFirm.update({
    where: { id: consultingFirmId },
    data: { proposalTokens: newBalance, lastTokenRefreshAt: now },
  })
}

export async function checkProposalTokens(
  consultingFirmId: string,
  cost = 1
): Promise<{ allowed: boolean; balance: number }> {
  await maybeRefreshTokens(consultingFirmId)
  const firm = await prisma.consultingFirm.findUnique({
    where: { id: consultingFirmId },
    select: { proposalTokens: true },
  })
  const balance = firm?.proposalTokens ?? 0
  return { allowed: balance >= cost, balance }
}

export async function deductProposalTokens(consultingFirmId: string, cost: number): Promise<number> {
  const updated = await prisma.consultingFirm.update({
    where: { id: consultingFirmId },
    data: { proposalTokens: { decrement: cost } },
    select: { proposalTokens: true },
  })
  return updated.proposalTokens
}

// Check if firm is within AI call limit this month
export async function checkAiCallLimit(consultingFirmId: string): Promise<{ allowed: boolean; current: number; max: number }> {
  const [plan, current] = await Promise.all([
    getFirmPlan(consultingFirmId),
    prisma.apiUsageLog.count({
      where: {
        consultingFirmId,
        cacheHit: false,
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
  ])
  if (plan.aiCallsPerMonth === -1) return { allowed: true, current, max: -1 }
  return { allowed: current < plan.aiCallsPerMonth, current, max: plan.aiCallsPerMonth }
}
