import { Link } from 'react-router-dom'
import { Lock, Zap } from 'lucide-react'
import { useTier, TierSlug } from '../hooks/useTier'

const TIER_NAMES: Record<TierSlug, string> = {
  starter: 'Starter',
  beta_lifetime: 'Beta Lifetime',
  professional: 'Professional',
  enterprise: 'Enterprise',
  elite: 'Elite',
}

const TIER_PRICES: Record<TierSlug, string> = {
  starter: '$299/mo',
  beta_lifetime: '$2,500 one-time',
  professional: '$699/mo',
  enterprise: '$1,000/mo',
  elite: '$4,500/mo',
}

interface TierGateProps {
  feature: string
  requiredTier: TierSlug
  children: React.ReactNode
  // compact = inline lock badge instead of full overlay card
  compact?: boolean
}

export function TierGate({ feature, requiredTier, children, compact = false }: TierGateProps) {
  const { hasFeature, isLoading } = useTier()

  if (isLoading) return null
  if (hasFeature(feature)) return <>{children}</>

  if (compact) {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-30 select-none">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Link
            to="/billing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/80 border border-amber-600 text-amber-300 text-xs font-medium hover:bg-amber-900 transition-colors backdrop-blur-sm"
          >
            <Lock className="w-3 h-3" />
            {TIER_NAMES[requiredTier]} feature
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-6 py-8 text-center">
      <div className="w-10 h-10 rounded-full bg-amber-900/30 border border-amber-700 flex items-center justify-center mx-auto mb-3">
        <Lock className="w-5 h-5 text-amber-400" />
      </div>
      <h3 className="font-semibold text-gray-200 mb-1">{TIER_NAMES[requiredTier]} Plan Required</h3>
      <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">
        {feature.replace(/_/g, ' ')} is available on the {TIER_NAMES[requiredTier]} plan and above.
        Starting at {TIER_PRICES[requiredTier]}/month.
      </p>
      <Link
        to="/billing"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors"
      >
        <Zap className="w-4 h-4" />
        Upgrade to {TIER_NAMES[requiredTier]}
      </Link>
    </div>
  )
}
