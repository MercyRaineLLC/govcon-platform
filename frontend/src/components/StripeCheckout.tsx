import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, CheckCircle2, Loader, AlertCircle, Lock, Package, Star } from 'lucide-react'
import { billingApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { useBranding } from '../hooks/useBranding'

interface CatalogItem {
  slug: string
  name: string
  priceCents: number
  priceUsd: number
  description: string
}

interface Catalog {
  configured: boolean
  lifetime: { name: string; priceCents: number; priceUsd: number }
  addons: CatalogItem[]
}

interface Props {
  hasLifetimeAccess: boolean
  purchasedAddons: string[]
}

export function StripeCheckout({ hasLifetimeAccess, purchasedAddons }: Props) {
  const { firm } = useAuth()
  const { branding } = useBranding(firm?.id)
  const [loadingItem, setLoadingItem] = useState<string | null>(null)
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery<Catalog>({
    queryKey: ['stripe-catalog'],
    queryFn: () => billingApi.getStripeCatalog(),
  })

  const handleLifetimeCheckout = async () => {
    setError('')
    setLoadingItem('lifetime')
    try {
      const origin = window.location.origin
      const session = await billingApi.startLifetimeCheckout(
        `${origin}/billing?checkout=success`,
        `${origin}/billing?checkout=canceled`
      )
      if (session?.url) {
        window.location.href = session.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to start checkout')
      setLoadingItem(null)
    }
  }

  const handleAddonCheckout = async (slug: string) => {
    setError('')
    setLoadingItem(slug)
    try {
      const origin = window.location.origin
      const session = await billingApi.startAddonCheckout(
        slug,
        `${origin}/billing?checkout=success&addon=${slug}`,
        `${origin}/billing?checkout=canceled`
      )
      if (session?.url) {
        window.location.href = session.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to start checkout')
      setLoadingItem(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    )
  }

  if (!data?.configured) {
    return (
      <div className="bg-yellow-950/30 border border-yellow-800 rounded-lg p-4 text-sm text-yellow-300 flex gap-2">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <div>
          <p className="font-medium">Stripe is not configured on this server</p>
          <p className="text-yellow-400/70 text-xs mt-1">
            Set <code className="font-mono bg-gray-900 px-1 rounded">STRIPE_SECRET_KEY</code> and{' '}
            <code className="font-mono bg-gray-900 px-1 rounded">STRIPE_WEBHOOK_SECRET</code> in backend env to enable checkout.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-950/30 border border-red-800 rounded-lg p-3 text-sm text-red-300 flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Lifetime access card */}
      <div
        className="rounded-xl p-6 border-2 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #050e1e 0%, #071120 100%)',
          borderColor: hasLifetimeAccess ? `${branding.secondaryColor}99` : `${branding.secondaryColor}40`,
        }}
      >
        <div
          className="absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${branding.primaryColor}, transparent)` }}
        />

        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}
            >
              <Star className="w-5 h-5 text-gray-900" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100">{data.lifetime.name}</h3>
              <p className="text-xs text-gray-500 uppercase tracking-widest mt-0.5">One-time payment · Lifetime access</p>
            </div>
          </div>
          {hasLifetimeAccess && (
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-green-900/40 text-green-300 border border-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Owned
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-black" style={{ color: branding.secondaryColor }}>
            ${data.lifetime.priceUsd.toLocaleString()}
          </span>
          <span className="text-sm text-gray-500">USD · one-time</span>
        </div>

        <ul className="text-sm text-gray-300 space-y-1.5 mb-5">
          <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: branding.secondaryColor }} /> Full BANKV Engine access (8-factor scoring + Bayesian calibration)</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: branding.secondaryColor }} /> Unlimited clients, opportunities, and bid decisions</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: branding.secondaryColor }} /> White-label client portal with your firm branding</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: branding.secondaryColor }} /> Compliance gap analysis (FAR/DFARS) + audit trail</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: branding.secondaryColor }} /> Email notifications + deadline reminders</li>
        </ul>

        <button
          onClick={handleLifetimeCheckout}
          disabled={hasLifetimeAccess || loadingItem === 'lifetime'}
          className="w-full font-bold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
          style={{
            background: hasLifetimeAccess
              ? '#374151'
              : `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`,
            color: hasLifetimeAccess ? '#9ca3af' : '#0b0f1a',
          }}
        >
          {loadingItem === 'lifetime' ? (
            <><Loader className="w-4 h-4 animate-spin" /> Redirecting to Stripe...</>
          ) : hasLifetimeAccess ? (
            <><Lock className="w-4 h-4" /> Lifetime access active</>
          ) : (
            <><CreditCard className="w-4 h-4" /> Get Lifetime Access</>
          )}
        </button>
      </div>

      {/* Add-ons */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-widest">Add-ons</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.addons.map((addon) => {
            const owned = purchasedAddons.includes(addon.slug)
            return (
              <div
                key={addon.slug}
                className="rounded-lg p-4 border bg-gray-900/50"
                style={{ borderColor: owned ? `${branding.secondaryColor}66` : '#1f2937' }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-semibold text-gray-100">{addon.name}</h4>
                  {owned && <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />}
                </div>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">{addon.description}</p>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-xl font-bold" style={{ color: branding.secondaryColor }}>
                    ${addon.priceUsd}
                  </span>
                  <span className="text-xs text-gray-600">USD</span>
                </div>
                <button
                  onClick={() => handleAddonCheckout(addon.slug)}
                  disabled={owned || loadingItem === addon.slug}
                  className="w-full text-xs font-medium py-1.5 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  style={{
                    background: owned ? '#374151' : `${branding.secondaryColor}26`,
                    border: owned ? '1px solid #4b5563' : `1px solid ${branding.secondaryColor}66`,
                    color: owned ? '#9ca3af' : branding.secondaryColor,
                  }}
                >
                  {loadingItem === addon.slug ? (
                    <><Loader className="w-3 h-3 animate-spin" /> Loading...</>
                  ) : owned ? (
                    <>Owned</>
                  ) : (
                    <>Purchase</>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 text-center tracking-widest uppercase">
        Secure checkout powered by Stripe · Test mode enabled when STRIPE_SECRET_KEY starts with sk_test_
      </p>
    </div>
  )
}
