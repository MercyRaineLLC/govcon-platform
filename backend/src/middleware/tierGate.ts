import { Response, NextFunction } from 'express'
import { prisma } from '../config/database'
import { AuthenticatedRequest } from '../types'
import { getTenantId } from './tenant'

// Feature slugs gated per tier
const TIER_FEATURES: Record<string, Set<string>> = {
  starter:      new Set(['compliance_matrix', 'opportunity_scoring', 'dashboard']),
  professional: new Set(['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library']),
  enterprise:   new Set(['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library', 'deep_market_intel', 'white_label', 'api_access']),
  elite:        new Set(['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library', 'deep_market_intel', 'white_label', 'api_access']),
}

// Max tracked opportunities per tier (enforced on ingest)
export const TIER_OPP_LIMITS: Record<string, number> = {
  starter: 150,
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
