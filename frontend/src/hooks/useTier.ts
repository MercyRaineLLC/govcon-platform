import { useQuery } from '@tanstack/react-query'
import { billingApi, addonsApi } from '../services/api'

export type TierSlug = 'starter' | 'professional' | 'enterprise' | 'elite'

export function useTier() {
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
    const FEATURES: Record<string, string[]> = {
      starter:      ['compliance_matrix', 'opportunity_scoring', 'dashboard'],
      professional: ['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library'],
      enterprise:   ['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library', 'deep_market_intel', 'white_label', 'api_access'],
      elite:        ['compliance_matrix', 'opportunity_scoring', 'dashboard', 'bid_guidance', 'analytics', 'client_portal', 'rewards', 'contract_vehicles', 'template_library', 'deep_market_intel', 'white_label', 'api_access'],
    }
    return FEATURES[slug]?.includes(feature) ?? false
  }

  function hasAddon(addonSlug: string): boolean {
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
