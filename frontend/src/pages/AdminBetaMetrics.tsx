import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Users, FileCheck, Send, Loader, AlertCircle, Star } from 'lucide-react'
import axios from 'axios'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001'

function getAuthToken(): string {
  try {
    const raw = localStorage.getItem('govcon_auth')
    return raw ? (JSON.parse(raw).token ?? '') : ''
  } catch { return '' }
}

interface FeedbackEntry {
  id: string
  npsScore: number
  killFeature: string | null
  addFeature: string | null
  freeText: string | null
  createdAt: string
}

interface Metrics {
  windowDays: number
  opportunitiesScored: number
  decisionsMade: number
  submissions: number
  proposalDrafts: number
  activeClients: number
  feedback: {
    count: number
    avgNps: number | null
    recent: FeedbackEntry[]
  }
}

export default function AdminBetaMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      setErrorMsg('')
      try {
        const res = await axios.get(`${API_BASE}/api/beta/metrics`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        })
        if (res.data?.success) {
          setMetrics(res.data.data)
        } else {
          setErrorMsg(res.data?.error || 'Failed to load metrics')
        }
      } catch (err: any) {
        setErrorMsg(err?.response?.data?.error || err?.message || 'Network error')
      } finally {
        setLoading(false)
      }
    }
    fetchMetrics()
  }, [])

  return (
    <div className="min-h-screen px-6 py-8" style={{ background: '#040d1a' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/" className="text-xs text-slate-500 hover:text-slate-300 inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Dashboard
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-xs text-slate-400">Admin · Beta Metrics</span>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">Beta Metrics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Aggregated firm activity over the last {metrics?.windowDays ?? 30} days. Admin-only view; data is
            tenant-scoped to your firm.
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader className="w-4 h-4 animate-spin" /> Loading metrics…
          </div>
        )}

        {errorMsg && !loading && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
        )}

        {metrics && !loading && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <KpiCard icon={<BarChart3 className="w-4 h-4" />} label="Opportunities scored" value={metrics.opportunitiesScored} />
              <KpiCard icon={<FileCheck className="w-4 h-4" />} label="Decisions made" value={metrics.decisionsMade} />
              <KpiCard icon={<Send className="w-4 h-4" />} label="Submissions" value={metrics.submissions} />
              <KpiCard icon={<FileCheck className="w-4 h-4" />} label="Proposal drafts" value={metrics.proposalDrafts} />
              <KpiCard icon={<Users className="w-4 h-4" />} label="Active clients" value={metrics.activeClients} />
            </div>

            <div className="card-gold p-6 mb-6" style={{ borderRadius: '12px' }}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-100">Feedback</h2>
                <span className="text-xs text-slate-500">{metrics.feedback.count} response(s) in window</span>
              </div>

              {metrics.feedback.avgNps !== null ? (
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="text-3xl font-bold"
                    style={{ color: metrics.feedback.avgNps >= 8 ? '#10b981' : metrics.feedback.avgNps >= 6 ? '#fbbf24' : '#ef4444' }}
                  >
                    {metrics.feedback.avgNps.toFixed(1)}
                  </div>
                  <div>
                    <p className="text-sm text-slate-300">Average NPS</p>
                    <p className="text-[11px] text-slate-500">8+ = healthy · 6–7 = at risk · ≤5 = remediation</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No feedback submitted yet. <Link to="/feedback" className="text-amber-400 hover:text-amber-300">Submit feedback now →</Link></p>
              )}

              {metrics.feedback.recent.length > 0 && (
                <div className="space-y-3">
                  {metrics.feedback.recent.slice(0, 5).map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg p-4"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Star className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-sm font-semibold text-slate-200">NPS {f.npsScore}</span>
                        </div>
                        <span className="text-[11px] text-slate-600">
                          {new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      {f.killFeature && (
                        <p className="text-xs text-slate-400 mb-1"><span className="text-slate-500">Kill:</span> {f.killFeature}</p>
                      )}
                      {f.addFeature && (
                        <p className="text-xs text-slate-400 mb-1"><span className="text-slate-500">Add:</span> {f.addFeature}</p>
                      )}
                      {f.freeText && (
                        <p className="text-xs text-slate-400"><span className="text-slate-500">Notes:</span> {f.freeText}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 text-center">
              Metrics window: last {metrics.windowDays} days. Data is firm-scoped; cross-tenant aggregates are not exposed by design.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        {icon}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-100">{value.toLocaleString()}</p>
    </div>
  )
}
