import { useQuery } from '@tanstack/react-query'
import { billingApi, addonsApi } from '../services/api'
import { useAuth } from './useAuth'

export type TierSlug = 'starter' | 'beta_lifetime' | 'professional' | 'enterprise' | 'elite'

export function useTier() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const { data, isLoading } = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => billingApi.getSubscription(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: addonsData } = useQuery({
    queryKey: ['addons'],
    queryFn: () => addonsApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  const slug = (data?.subscription?.plan?.slug ?? 'starter') as TierSlug
  const status = data?.subscription?.status ?? 'ACTIVE'
  const usage = data?.usage ?? { clients: 0, users: 0, aiCalls: 0 }
  const plan = data?.subscription?.plan

  function hasFeature(feature: string): boolean {
    const PRO_FEATURES = ['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library']
    const ENT_FEATURES = [...PRO_FEATURES, 'deep_market_intel', 'white_label', 'api_access']
    const FEATURES: Record<string, string[]> = {
      starter:        ['compliance_matrix', 'opportunity_scoring', 'dashboard'],
      beta_lifetime:  PRO_FEATURES,
      professional:   PRO_FEATURES,
      enterprise:     ENT_FEATURES,
      elite:          ENT_FEATURES,
    }
    return FEATURES[slug]?.includes(feature) ?? false
  }

  function hasAddon(addonSlug: string): boolean {
    if (isAdmin) return true  // Admins have access to all add-ons
    if (slug === 'elite') return true  // Elite includes all add-ons
    const addons: any[] = addonsData?.data ?? []
    return addons.some(a => a.slug === addonSlug && a.purchased)
  }

  function atOrAbove(tier: TierSlug): boolean {
    const RANK: Record<string, number> = { starter: 0, professional: 1, enterprise: 2, elite: 3 }
    return (RANK[slug] ?? 0) >= (RANK[tier] ?? 0)
  }

  return { slug, status, usage, plan, hasFeature, hasAddon, atOrAbove, isLoading }
}
