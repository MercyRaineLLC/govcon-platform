import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { billingApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Zap,
  Users,
  Building2,
  FileText,
  RefreshCw,
} from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE:        'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    TRIALING:      'bg-blue-500/15 text-blue-400 border-blue-500/30',
    PAST_DUE:      'bg-red-500/15 text-red-400 border-red-500/30',
    CANCELED:      'bg-slate-500/15 text-slate-400 border-slate-500/30',
    PAUSED:        'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  }
  const labels: Record<string, string> = {
    ACTIVE: 'Active', TRIALING: 'Trial', PAST_DUE: 'Past Due', CANCELED: 'Canceled', PAUSED: 'Paused',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[status] ?? map.CANCELED}`}>
      {labels[status] ?? status}
    </span>
  )
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN:          'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    PAID:          'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    DRAFT:         'bg-slate-500/15 text-slate-400 border-slate-500/30',
    VOID:          'bg-slate-500/10 text-slate-600 border-slate-500/20',
    UNCOLLECTIBLE: 'bg-red-500/15 text-red-400 border-red-500/30',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${map[status] ?? map.DRAFT}`}>
      {status}
    </span>
  )
}

function UsageMeter({
  label, used, limit, icon: Icon,
}: {
  label: string; used: number; limit: number; icon: React.ElementType
}) {
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-amber-400'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-400">
          <Icon className="w-3.5 h-3.5" />
          {label}
        </span>
        <span className="text-slate-300 font-medium">
          {used.toLocaleString()} / {limit === -1 ? '∞' : limit.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        {limit === -1
          ? <div className="h-full rounded-full bg-amber-400/30 w-full" />
          : <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />}
      </div>
    </div>
  )
}

// ─── main component ─────────────────────────────────────────
export default function BillingPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const qc = useQueryClient()

  const [selectedCycle, setSelectedCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => billingApi.getSubscription(),
    staleTime: 30_000,
  })
  const { data: plansData } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => billingApi.getPlans(),
    staleTime: 600_000,
  })
  const { data: invoicesData, isLoading: invLoading } = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: () => billingApi.getInvoices({ limit: 20 }),
    staleTime: 30_000,
  })

  const subscription = subData?.subscription
  const usage        = subData?.usage
  const plan         = subscription?.plan
  const plans        = (plansData?.plans ?? []) as any[]
  const invoices     = (invoicesData?.invoices ?? []) as any[]

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const invalidateSub = () => qc.invalidateQueries({ queryKey: ['billing-subscription'] })
  const invalidateInv = () => qc.invalidateQueries({ queryKey: ['billing-invoices'] })

  const subscribeMut = useMutation({
    mutationFn: ({ planId, cycle }: { planId: string; cycle: 'MONTHLY' | 'ANNUAL' }) =>
      billingApi.subscribe(planId, cycle),
    onSuccess: () => { invalidateSub(); flash('ok', 'Subscription updated') },
    onError: () => flash('err', 'Failed to update subscription'),
  })
  const cancelMut = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: () => { invalidateSub(); flash('ok', 'Subscription will cancel at period end') },
    onError: () => flash('err', 'Failed to cancel subscription'),
  })
  const reactivateMut = useMutation({
    mutationFn: () => billingApi.reactivate(),
    onSuccess: () => { invalidateSub(); flash('ok', 'Subscription reactivated') },
    onError: () => flash('err', 'Failed to reactivate'),
  })
  const generateMut = useMutation({
    mutationFn: (notes: string) => billingApi.generateInvoice(notes),
    onSuccess: () => {
      invalidateInv()
      setShowGenerateModal(false)
      setInvoiceNotes('')
      flash('ok', 'Invoice generated')
    },
    onError: () => flash('err', 'Failed to generate invoice'),
  })
  const markStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      billingApi.updateInvoiceStatus(id, status),
    onSuccess: () => { invalidateInv(); flash('ok', 'Invoice updated') },
    onError: () => flash('err', 'Failed to update invoice'),
  })

  // ── plan card styles ─────────────────────────────────────
  const planBorder: Record<string, string> = {
    starter: 'rgba(255,255,255,0.07)',
    professional: 'rgba(245,158,11,0.35)',
    enterprise: 'rgba(59,130,246,0.25)',
  }

  if (subLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Billing & Subscription</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your plan, usage, and invoices</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowGenerateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}
          >
            <FileText className="w-4 h-4" />
            Generate Invoice
          </button>
        )}
      </div>

      {/* Flash */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border ${
          msg.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Top row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Current Plan */}
        <div className="rounded-xl p-6 space-y-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">Current Plan</p>
              <h2 className="text-xl font-bold text-slate-100">{plan?.name ?? '—'}</h2>
            </div>
            <div className="flex flex-col items-end gap-2">
              {subscription && <StatusBadge status={subscription.status} />}
              {subscription?.cancelAtPeriodEnd && (
                <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                  Cancels at period end
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-600 text-[11px] uppercase tracking-wide">Billing Cycle</p>
              <p className="text-slate-200 font-medium mt-0.5">
                {subscription?.billingCycle === 'ANNUAL' ? 'Annual' : 'Monthly'}
              </p>
            </div>
            <div>
              <p className="text-slate-600 text-[11px] uppercase tracking-wide">Monthly Rate</p>
              <p className="text-amber-400 font-bold mt-0.5">
                {plan
                  ? fmt(Number(subscription?.billingCycle === 'ANNUAL' ? plan.annualPriceUsd : plan.monthlyPriceUsd))
                  : '—'}
                <span className="text-slate-500 font-normal text-xs">/mo</span>
              </p>
            </div>
            <div>
              <p className="text-slate-600 text-[11px] uppercase tracking-wide">Period Start</p>
              <p className="text-slate-300 font-medium mt-0.5">{fmtDate(subscription?.currentPeriodStart)}</p>
            </div>
            <div>
              <p className="text-slate-600 text-[11px] uppercase tracking-wide">
                {subscription?.status === 'TRIALING' ? 'Trial Ends' : 'Next Renewal'}
              </p>
              <p className="text-slate-300 font-medium mt-0.5">{fmtDate(subscription?.currentPeriodEnd)}</p>
            </div>
          </div>

          {isAdmin && subscription && (
            <div className="pt-1 flex gap-2 flex-wrap">
              {subscription.cancelAtPeriodEnd ? (
                <button
                  onClick={() => reactivateMut.mutate()}
                  disabled={reactivateMut.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  Reactivate Subscription
                </button>
              ) : subscription.status !== 'CANCELED' ? (
                <button
                  onClick={() => { if (confirm('Cancel subscription at period end?')) cancelMut.mutate() }}
                  disabled={cancelMut.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
                >
                  Cancel at Period End
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Usage */}
        <div className="rounded-xl p-6 space-y-5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-[11px] text-slate-500 uppercase tracking-widest mb-1">Usage This Month</p>
            <h2 className="text-xl font-bold text-slate-100">Resource Utilization</h2>
          </div>

          {usage && plan ? (
            <div className="space-y-4">
              <UsageMeter label="Active Clients"  used={usage.clients}  limit={plan.maxClients}      icon={Building2} />
              <UsageMeter label="Active Users"    used={usage.users}    limit={plan.maxUsers}        icon={Users} />
              <UsageMeter label="AI Calls (live)" used={usage.aiCalls}  limit={plan.aiCallsPerMonth} icon={Zap} />
            </div>
          ) : (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded bg-white/5 animate-pulse" />
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-600">AI calls exclude cache hits · Resets on the 1st of each month</p>
        </div>
      </div>

      {/* Plan comparison */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-200">Available Plans</h3>
          {isAdmin && (
            <div className="flex items-center gap-1 p-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCycle(c)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    selectedCycle === c ? 'bg-amber-500 text-black' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {c === 'MONTHLY' ? 'Monthly' : 'Annual (save 15%)'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((p) => {
            const isCurrent = p.id === subscription?.planId
            const price = selectedCycle === 'ANNUAL' ? Number(p.annualPriceUsd) : Number(p.monthlyPriceUsd)
            const features: string[] = Array.isArray(p.features) ? p.features : []
            return (
              <div
                key={p.id}
                className="rounded-xl p-5 flex flex-col gap-4 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCurrent ? 'rgba(245,158,11,0.4)' : (planBorder[p.slug] ?? 'rgba(255,255,255,0.07)')}`,
                  boxShadow: p.slug === 'professional' ? '0 0 20px rgba(245,158,11,0.06)' : undefined,
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-widest">{p.slug}</p>
                    <h4 className="text-lg font-bold text-slate-100 mt-0.5">{p.name}</h4>
                  </div>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 mt-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      Current
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-2xl font-bold text-slate-100">{fmt(price)}</span>
                  <span className="text-slate-500 text-xs">/mo</span>
                  {selectedCycle === 'ANNUAL' && (
                    <p className="text-[11px] text-emerald-400 mt-0.5">Billed as {fmt(price * 12)}/yr</p>
                  )}
                </div>

                <ul className="space-y-1.5 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isAdmin && !isCurrent && (
                  <button
                    onClick={() => subscribeMut.mutate({ planId: p.id, cycle: selectedCycle })}
                    disabled={subscribeMut.isPending}
                    className="w-full py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: p.slug === 'professional' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
                      border: p.slug === 'professional' ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(255,255,255,0.1)',
                      color: p.slug === 'professional' ? '#f59e0b' : '#94a3b8',
                    }}
                  >
                    {subscribeMut.isPending ? 'Updating…' : 'Select Plan'}
                  </button>
                )}
                {isCurrent && (
                  <div className="w-full py-2 rounded-lg text-sm font-semibold text-center text-slate-600"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    Active Plan
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Invoice history */}
      <div>
        <h3 className="text-base font-bold text-slate-200 mb-4">Invoice History</h3>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {invLoading ? (
            <div className="p-8 text-center text-slate-600 text-sm">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-600 text-sm">No invoices yet</p>
              {isAdmin && (
                <p className="text-slate-700 text-xs mt-1">Use "Generate Invoice" above to create your first invoice</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Invoice #', 'Period', 'Amount', 'Due', 'Status', ...(isAdmin ? ['Actions'] : [])].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any, i: number) => (
                  <tr
                    key={inv.id}
                    style={{ borderBottom: i < invoices.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-amber-400">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-semibold">{fmt(Number(inv.totalUsd))}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(inv.dueAt)}</td>
                    <td className="px-4 py-3"><InvoiceStatusBadge status={inv.status} /></td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {inv.status === 'OPEN' && (
                            <>
                              <button
                                onClick={() => markStatusMut.mutate({ id: inv.id, status: 'PAID' })}
                                disabled={markStatusMut.isPending}
                                className="text-[11px] px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                              >
                                Mark Paid
                              </button>
                              <button
                                onClick={() => markStatusMut.mutate({ id: inv.id, status: 'VOID' })}
                                disabled={markStatusMut.isPending}
                                className="text-[11px] px-2 py-1 rounded bg-slate-500/10 border border-slate-500/30 text-slate-500 hover:bg-slate-500/20 transition-all disabled:opacity-50"
                              >
                                Void
                              </button>
                            </>
                          )}
                          {inv.status === 'PAID' && inv.paidAt && (
                            <span className="text-[11px] text-slate-600">Paid {fmtDate(inv.paidAt)}</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Generate Invoice Modal */}
      {showGenerateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowGenerateModal(false)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md space-y-4"
            style={{ background: '#0b1628', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-slate-100">Generate Invoice</h3>
            <p className="text-sm text-slate-400">
              Creates an invoice for the current subscription period at the active plan rate.
            </p>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Notes (optional)</label>
              <textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                rows={3}
                placeholder="Add any notes to appear on the invoice…"
                className="w-full rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => generateMut.mutate(invoiceNotes)}
                disabled={generateMut.isPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}
              >
                {generateMut.isPending ? 'Generating…' : 'Generate Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
