import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../services/api'
import {
  Search, BarChart3, Shield, Users, FileText, Zap,
  CheckCircle, ArrowRight, Star, Activity,
} from 'lucide-react'
import { isBetaPricingHidden, getBetaRequestUrl, BETA_CTA_LABEL } from '../utils/betaMode'

// Pricing table config (env-driven so test/live mode can be toggled per build)
const STRIPE_PRICING_TABLE_ID =
  (import.meta as any).env?.VITE_STRIPE_PRICING_TABLE_ID ||
  'prctbl_1TPKQmRzS6zmMIjgLGxlHJpv'
const STRIPE_PUBLISHABLE_KEY =
  (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
  'pk_live_51TPHrxRzS6zmMIjg7yzDaRIq4ceMb5jhmL0XX0B4rsBfSABNVKz4bSkJvl4llaVFsaxMjzzFchXbVlGHTtCYYKWu00xUGF7MPR'

// stripe-pricing-table is a custom element — extend JSX intrinsic types
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'stripe-pricing-table': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'pricing-table-id': string
          'publishable-key': string
        },
        HTMLElement
      >
    }
  }
}

function UmbrellaLogo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="landCanopy" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <filter id="landGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d="M32 7 C15 7 3 19 3 33 L61 33 C61 19 49 7 32 7Z" fill="url(#landCanopy)" filter="url(#landGlow)" />
      <line x1="32" y1="7"  x2="32" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4" />
      <line x1="20" y1="9.5" x2="22" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4" />
      <line x1="44" y1="9.5" x2="42" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4" />
      <line x1="10" y1="17" x2="14" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4" />
      <line x1="54" y1="17" x2="50" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4" />
      <line x1="32" y1="33" x2="32" y2="54" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 54 Q32 61 25 61 Q20 61 20 55.5" stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

const features = [
  { icon: Search,    title: 'SAM.gov Pipeline',      desc: 'Auto-ingest and track federal opportunities with real-time sync' },
  { icon: BarChart3, title: 'AI Win Scoring',         desc: '8-factor probability engine with Bayesian calibration per client' },
  { icon: Activity,  title: 'Revenue Forecasting',    desc: 'Monte Carlo simulation across your entire portfolio' },
  { icon: Shield,    title: 'Compliance Matrix',      desc: 'AI-generated document requirements for every solicitation' },
  { icon: Users,     title: 'Client Intelligence',    desc: 'Multi-client management with enrichment and portal access' },
  { icon: FileText,  title: 'Proposal Assistant',     desc: 'AI-guided Q&A flow to generate winning proposal drafts' },
]

export function LandingPage() {
  const { data: betaData } = useQuery({
    queryKey: ['beta-status'],
    queryFn: () => authApi.betaStatus(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
  const slots = betaData?.data
  const slotsRemaining = slots?.slotsRemaining ?? null

  // Load Stripe Pricing Table script once on mount (idempotent — checks for existing tag)
  useEffect(() => {
    const SRC = 'https://js.stripe.com/v3/pricing-table.js'
    if (document.querySelector(`script[src="${SRC}"]`)) return
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    document.body.appendChild(script)
  }, [])

  return (
    <div className="min-h-screen" style={{ background: '#040d1a' }}>

      {/* ---- Top bar ---- */}
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <UmbrellaLogo size={32} />
          <div>
            <p className="text-xs font-black tracking-[0.1em] text-gradient-gold leading-none"
              style={{
                background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
              MR GOVCON
            </p>
            <p className="text-[8px] text-slate-600 tracking-[0.2em] uppercase">Advisory Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-slate-400 hover:text-slate-200 transition-colors font-medium">
            Sign In
          </Link>
          <Link to="/register" className="btn-primary text-xs py-2 px-4">
            Start Free Trial <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative px-6 pt-16 pb-20 max-w-6xl mx-auto text-center overflow-hidden">
        {/* Ambient glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(245,158,11,0.08) 0%, transparent 70%)' }}
        />

        <div className="relative z-10">
          <span className="veteran-badge mb-6 inline-flex">★ Veteran Owned & Operated</span>

          <h1
            className="text-4xl md:text-6xl font-black text-slate-100 leading-tight mb-5"
            style={{ letterSpacing: '-0.03em' }}
          >
            Win More.<br />
            <span
              style={{
                background: 'linear-gradient(90deg, #fbbf24, #f59e0b, #d97706)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Bid Smarter.
            </span>
          </h1>

          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-8 leading-relaxed">
            The AI-powered intelligence platform that helps GovCon advisory firms
            find, score, and win federal contracts — systematically.
          </p>

          <div className="flex items-center justify-center gap-4 mb-8">
            <Link to="/register" className="btn-primary text-sm py-3 px-6">
              Start 14-Day Free Trial <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/login" className="btn-secondary text-sm py-3 px-6">
              Sign In
            </Link>
          </div>

          {/* Beta counter */}
          {slotsRemaining !== null && slotsRemaining > 0 && (
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full animate-gold-pulse"
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.25)',
              }}
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-amber-300">
                {slotsRemaining} of {slots.slotsTotal} beta slots remaining
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ---- Divider ---- */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="divider-gold" />
      </div>

      {/* ---- Features Grid ---- */}
      <section className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500 mb-3">Platform Capabilities</p>
          <h2 className="text-3xl font-black text-slate-100" style={{ letterSpacing: '-0.02em' }}>
            Everything your advisory firm needs
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="card-interactive group">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.15)',
                }}
              >
                <f.icon className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              </div>
              <h3 className="text-sm font-bold text-slate-200 mb-1.5">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Pricing Banner ---- */}
      {isBetaPricingHidden() ? (
        <section className="px-6 py-16 max-w-4xl mx-auto">
          <div
            className="card-gold text-center py-12 px-8"
            style={{ borderRadius: '16px' }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-3">
              Beta Access · Pricing To Be Announced
            </p>
            <h2 className="text-3xl font-black text-slate-100 mb-3" style={{ letterSpacing: '-0.02em' }}>
              MrGovCon is in invite-only beta
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto mb-8">
              We are onboarding a limited cohort of federal contracting consultants and
              freight brokerage operators. Final pricing tiers and Founders Lifetime
              terms will be announced at general availability.
            </p>

            <div className="flex flex-col items-center gap-4">
              <a href={getBetaRequestUrl()} className="btn-primary text-sm py-3 px-8">
                {BETA_CTA_LABEL} <ArrowRight className="w-4 h-4" />
              </a>
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Invite-only access</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> No credit card during beta</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Direct line to the platform team</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="px-6 py-16 max-w-4xl mx-auto">
            <div
              className="card-gold text-center py-12 px-8"
              style={{ borderRadius: '16px' }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-3">
                Limited Beta Offer
              </p>
              <h2 className="text-3xl font-black text-slate-100 mb-2" style={{ letterSpacing: '-0.02em' }}>
                Lifetime Access —{' '}
                <span
                  style={{
                    background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  $2,500
                </span>
              </h2>
              <p className="text-sm text-slate-500 mb-1">
                <span className="line-through text-slate-600">$12,000/yr</span>
                {' '}— One-time payment. Professional tier base features forever.
              </p>
              <p className="text-xs text-slate-600 mb-8">
                Limited to 10 founders · Founding Member badge · Priority support · Add-ons available separately
              </p>

              <div className="flex flex-col items-center gap-4">
                <Link to="/register" className="btn-primary text-sm py-3 px-8">
                  Claim Your Spot <ArrowRight className="w-4 h-4" />
                </Link>
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> 14-day free trial</span>
                  <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> No credit card to start</span>
                  <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500" /> Cancel anytime during trial</span>
                </div>
              </div>
            </div>
          </section>

          {/* ---- Recurring Subscription Tiers (Stripe Pricing Table) ---- */}
          <section className="px-6 py-16 max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400 mb-3">
                Or Choose a Monthly Plan
              </p>
              <h2 className="text-3xl font-black text-slate-100 mb-2" style={{ letterSpacing: '-0.02em' }}>
                Recurring Subscription Plans
              </h2>
              <p className="text-sm text-slate-500 max-w-xl mx-auto">
                Prefer to pay as you grow? Choose a monthly plan and scale up as your firm scales.
              </p>
            </div>
            <stripe-pricing-table
              pricing-table-id={STRIPE_PRICING_TABLE_ID}
              publishable-key={STRIPE_PUBLISHABLE_KEY}
            />
          </section>
        </>
      )}

      {/* ---- Trust Footer ---- */}
      <section className="px-6 py-12 max-w-6xl mx-auto text-center">
        <div className="flex items-center justify-center gap-6 mb-6 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>Bank-Grade Encryption</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Star className="w-3.5 h-3.5 text-amber-600" />
            <span>Veteran Owned & Operated</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>AI-Powered Intelligence</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-800 tracking-widest">
          © {new Date().getFullYear()} MERCY RAINE LLC · Mr GovCon · All Rights Reserved
        </p>
      </section>
    </div>
  )
}
