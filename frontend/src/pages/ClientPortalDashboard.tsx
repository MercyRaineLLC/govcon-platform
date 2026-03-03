import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, LogOut, FileText, DollarSign, Gift, CheckCircle, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import axios from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

interface DocRequirement {
  id: string
  title: string
  description?: string
  dueDate: string
  status: string
  daysUntil: number
  urgency: string
  isPenaltyEnabled: boolean
  penaltyAmount?: number
  penaltyPercent?: number
  opportunity?: {
    id: string
    title: string
    probabilityScore?: number
    expectedValue?: number
    scoreBreakdown?: any
  }
}

interface Penalty {
  id: string
  amount: number
  reason: string
  isPaid: boolean
  appliedAt: string
}

interface Reward {
  id: string
  rewardType: string
  description: string
  value?: number
  percentDiscount?: number
  isRedeemed: boolean
  expiresAt?: string
  triggerReason: string
}

interface Summary {
  totalDocuments: number
  submitted: number
  pending: number
  overdue: number
  totalOutstandingFees: number
  activeRewards: number
}

function UrgencyBadge({ urgency, daysUntil }: { urgency: string; daysUntil: number }) {
  if (urgency === 'SUBMITTED') return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-900/40 text-green-300 border border-green-700 px-2 py-0.5 rounded">
      <CheckCircle className="w-3 h-3" /> Submitted
    </span>
  )
  if (urgency === 'OVERDUE') return (
    <span className="inline-flex items-center gap-1 text-xs bg-red-900/50 text-red-300 border border-red-700 px-2 py-0.5 rounded">
      <AlertTriangle className="w-3 h-3" /> OVERDUE
    </span>
  )
  if (urgency === 'URGENT') return (
    <span className="inline-flex items-center gap-1 text-xs bg-orange-900/40 text-orange-300 border border-orange-700 px-2 py-0.5 rounded">
      <AlertTriangle className="w-3 h-3" /> {daysUntil}d — URGENT
    </span>
  )
  if (urgency === 'SOON') return (
    <span className="inline-flex items-center gap-1 text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-2 py-0.5 rounded">
      <Clock className="w-3 h-3" /> {daysUntil}d remaining
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-900/20 text-green-400 border border-green-800 px-2 py-0.5 rounded">
      <CheckCircle className="w-3 h-3" /> {daysUntil}d remaining
    </span>
  )
}

function DocCard({ req, onMarkSubmitted }: { req: DocRequirement; onMarkSubmitted: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)

  const fmt = (v: number) =>
    v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`

  return (
    <div className={`border rounded-lg ${
      req.urgency === 'OVERDUE' ? 'border-red-800 bg-red-950/10' :
      req.urgency === 'URGENT' ? 'border-orange-800 bg-orange-950/10' :
      req.urgency === 'SUBMITTED' ? 'border-green-800/40 bg-green-950/10' :
      'border-gray-800'
    }`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-200 text-sm">{req.title}</h3>
            {req.opportunity && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                Related to: {req.opportunity.title}
              </p>
            )}
          </div>
          <UrgencyBadge urgency={req.urgency} daysUntil={req.daysUntil} />
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
          <span>Due: {new Date(req.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          {req.isPenaltyEnabled && req.urgency !== 'SUBMITTED' && (
            <span className="text-red-400">
              Penalty: {req.penaltyAmount ? `$${req.penaltyAmount.toLocaleString()} flat fee` :
                req.penaltyPercent ? `${req.penaltyPercent}% of contract value` : 'configured'}
            </span>
          )}
        </div>

        {req.description && (
          <p className="text-xs text-gray-400 mb-3">{req.description}</p>
        )}

        <div className="flex items-center gap-2">
          {req.status === 'PENDING' && (
            <button
              onClick={() => onMarkSubmitted(req.id)}
              className="text-xs bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-700 px-3 py-1.5 rounded transition-colors"
            >
              Mark as Submitted
            </button>
          )}
          {req.opportunity?.scoreBreakdown && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
            >
              Why us?
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {expanded && req.opportunity?.scoreBreakdown && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Why You're a Good Fit</p>
            <p className="text-xs text-blue-300 mb-3 font-medium">
              Win probability: {Math.round((req.opportunity.probabilityScore ?? 0) * 100)}%
              {req.opportunity.expectedValue ? ` · Expected value: ${fmt(req.opportunity.expectedValue)}` : ''}
            </p>
            <div className="space-y-2">
              {req.opportunity.scoreBreakdown?.factorContributions
                ?.sort((a: any, b: any) => b.weight - a.weight)
                .slice(0, 4)
                .map((f: any) => (
                  <div key={f.factor} className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${f.pct >= 70 ? 'bg-green-500' : f.pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${f.pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-20 text-right truncate">
                      {f.factor.replace(/Score$/, '').replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="text-xs font-mono text-gray-500 w-8 text-right">{f.pct}%</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClientPortalDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'docs' | 'penalties' | 'rewards'>('docs')

  const auth = (() => {
    try { return JSON.parse(localStorage.getItem('govcon_client_auth') ?? '') } catch { return null }
  })()

  useEffect(() => {
    if (!auth?.token) { navigate('/client-login'); return }
    axios.get(`${API_BASE}/api/client-portal/dashboard`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    }).then((r) => setData(r.data.data)).catch(() => setError('Failed to load dashboard')).finally(() => setLoading(false))
  }, [])

  const handleMarkSubmitted = async (reqId: string) => {
    try {
      await axios.put(`${API_BASE}/api/doc-requirements/${reqId}`, { status: 'SUBMITTED' }, {
        headers: { Authorization: `Bearer ${auth.token}` },
      })
      const res = await axios.get(`${API_BASE}/api/client-portal/dashboard`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      })
      setData(res.data.data)
    } catch { /* non-fatal */ }
  }

  const handleLogout = () => {
    localStorage.removeItem('govcon_client_auth')
    navigate('/client-login')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading your dashboard...</div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 mb-4">{error || 'Session expired'}</p>
        <button onClick={() => navigate('/client-login')} className="text-blue-400 hover:underline text-sm">
          Return to login
        </button>
      </div>
    </div>
  )

  const { client, docRequirements, penalties, rewards, summary } = data

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm font-semibold text-gray-200">{client?.name}</p>
              <p className="text-xs text-gray-500">Client Portal</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Documents Due</p>
            <p className="text-2xl font-bold text-gray-200">{summary.totalDocuments}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Submitted</p>
            <p className="text-2xl font-bold text-green-400">{summary.submitted}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Outstanding Fees</p>
            <p className={`text-2xl font-bold font-mono ${summary.totalOutstandingFees > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              ${summary.totalOutstandingFees.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Active Rewards</p>
            <p className="text-2xl font-bold text-blue-400">{summary.activeRewards}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {([
            { key: 'docs', label: 'Document Requirements', icon: FileText, count: summary.pending },
            { key: 'penalties', label: 'Fees & Penalties', icon: DollarSign, count: penalties?.length },
            { key: 'rewards', label: 'Rewards', icon: Gift, count: summary.activeRewards },
          ] as const).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors -mb-px ${
                tab === key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {count > 0 && (
                <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab: Document Requirements */}
        {tab === 'docs' && (
          <div className="space-y-3">
            {docRequirements?.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">No document requirements assigned.</p>
            )}
            {docRequirements?.map((req: DocRequirement) => (
              <DocCard key={req.id} req={req} onMarkSubmitted={handleMarkSubmitted} />
            ))}
          </div>
        )}

        {/* Tab: Penalties */}
        {tab === 'penalties' && (
          <div className="space-y-3">
            {penalties?.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">No penalties on record. Keep up the great work!</p>
            )}
            {penalties?.map((p: Penalty) => (
              <div key={p.id} className={`border rounded-lg p-4 ${p.isPaid ? 'border-gray-800' : 'border-red-800/50'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-200">{p.reason}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Applied: {new Date(p.appliedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold font-mono ${p.isPaid ? 'text-gray-500' : 'text-red-400'}`}>
                      ${Number(p.amount).toLocaleString()}
                    </p>
                    <span className={`text-xs ${p.isPaid ? 'text-green-400' : 'text-red-400'}`}>
                      {p.isPaid ? '✓ Paid' : 'Outstanding'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Rewards */}
        {tab === 'rewards' && (
          <div className="space-y-3">
            {rewards?.length === 0 && (
              <div className="text-center py-8">
                <Gift className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No rewards yet. Submit documents on time to earn rewards!</p>
              </div>
            )}
            {rewards?.map((r: Reward) => (
              <div key={r.id} className={`border rounded-lg p-4 ${r.isRedeemed ? 'border-gray-800 opacity-60' : 'border-blue-800/50 bg-blue-950/10'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        r.rewardType === 'FEE_DISCOUNT' ? 'bg-green-900/40 text-green-300' :
                        r.rewardType === 'SUBSCRIPTION_CREDIT' ? 'bg-blue-900/40 text-blue-300' :
                        'bg-purple-900/40 text-purple-300'
                      }`}>
                        {r.rewardType.replace(/_/g, ' ')}
                      </span>
                      {r.isRedeemed && <span className="text-xs text-gray-500">Redeemed</span>}
                    </div>
                    <p className="text-sm text-gray-200">{r.description}</p>
                    {r.expiresAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        Expires: {new Date(r.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {(r.value || r.percentDiscount) && (
                    <div className="text-right">
                      {r.value && <p className="text-lg font-bold font-mono text-blue-400">${Number(r.value).toLocaleString()}</p>}
                      {r.percentDiscount && <p className="text-lg font-bold font-mono text-green-400">{r.percentDiscount}% off</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
