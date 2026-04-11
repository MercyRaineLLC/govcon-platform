import { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi, clientDocumentsApi, clientOpportunitiesApi, clientPortalApi, clientPortalUsersApi } from '../services/api'
import { PageHeader, Spinner, ErrorBanner, formatCurrency } from '../components/ui'
import {
  ArrowLeft, Shield, CheckCircle, XCircle, AlertTriangle,
  FileText, DollarSign, TrendingUp, Building2, Hash,
  Upload, Trash2, Share2, BookMarked, CheckCircle2,
  Phone, Globe, MapPin, CreditCard, CalendarClock,
  Briefcase, Ban, RotateCcw, Download, Info, Target, Scale, Activity,
  KeyRound, Eye, EyeOff, UserCheck, UserX, RefreshCw, Plus, Lock,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── Reusable info tooltip ─────────────────────────────────────
function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Info className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400 cursor-help transition-colors" />
      {show && (
        <span className="fixed z-[9999] w-72 bg-gray-800 border border-gray-700 text-xs text-gray-300 rounded-lg px-3 py-2 shadow-xl leading-relaxed whitespace-normal"
          style={{ transform: 'translate(-50%, 8px)', left: '50%', top: 'auto', pointerEvents: 'none' }}
          ref={(el) => {
            if (el) {
              const rect = el.parentElement?.getBoundingClientRect()
              if (rect) {
                el.style.left = rect.left + rect.width / 2 + 'px'
                el.style.top = rect.bottom + 8 + 'px'
                el.style.transform = 'translateX(-50%)'
                // Keep within viewport
                const elRect = el.getBoundingClientRect()
                if (elRect.right > window.innerWidth - 8) {
                  el.style.left = window.innerWidth - elRect.width - 8 + 'px'
                  el.style.transform = 'none'
                }
                if (elRect.left < 8) {
                  el.style.left = '8px'
                  el.style.transform = 'none'
                }
              }
            }
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

const DOC_TYPE_LABELS: Record<string, string> = {
  CAPABILITY_STATEMENT: 'Capability Statement',
  PAST_PERFORMANCE: 'Past Performance',
  TECHNICAL_PROPOSAL: 'Technical Proposal',
  MANAGEMENT_APPROACH: 'Management Approach',
  PRICE_VOLUME: 'Price/Cost Volume',
  SMALL_BUSINESS_PLAN: 'Small Business Plan',
  TEAMING_AGREEMENT: 'Teaming Agreement',
  COVER_LETTER: 'Cover Letter',
  OTHER: 'Other',
}

const KNOWN_VEHICLES = [
  'OASIS+','OASIS','SEWP V','SEWP','Alliant 3','Alliant 2','CIO-SP4','CIO-SP3',
  '8(a) STARS III','Polaris','VETS 2','T4NG','ITES-3S','NETCENTS-2','SPARC','RS3',
  'GSA MAS','GSA Schedule 70','GSA Schedule 84','EAGLE II','ENCORE III',
  'SeaPort-e','SETI','HCATS','GWAC','IDIQ','BPA','BOA','MATOC',
]

function VehicleManager({ clientId, vehicles }: { clientId: string; vehicles: string[] }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [custom, setCustom] = useState('')

  const saveMutation = useMutation({
    mutationFn: (updated: string[]) =>
      clientsApi.update(clientId, { contractVehicles: updated }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId] }),
  })

  const add = (v: string) => {
    const trimmed = v.trim()
    if (!trimmed || vehicles.includes(trimmed)) return
    saveMutation.mutate([...vehicles, trimmed])
    setCustom('')
    setAdding(false)
  }

  const remove = (v: string) => saveMutation.mutate(vehicles.filter(x => x !== v))

  return (
    <div className="mt-4">
      <p className="text-gray-500 text-xs mb-1.5 flex items-center gap-1">
        <Briefcase className="w-3 h-3" /> Contract Vehicles
      </p>
      <div className="flex flex-wrap gap-1.5">
        {vehicles.map(v => (
          <span key={v} className="flex items-center gap-1 text-xs bg-violet-900/40 text-violet-300 border border-violet-700/60 px-2 py-0.5 rounded">
            {v}
            <button onClick={() => remove(v)} className="text-violet-500 hover:text-red-400 transition-colors ml-0.5">×</button>
          </span>
        ))}
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-gray-500 hover:text-amber-400 border border-dashed border-gray-700 hover:border-amber-500/40 px-2 py-0.5 rounded transition-colors">
            + Add vehicle
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-2 flex gap-2 items-center flex-wrap">
          <select className="input text-xs py-1 w-52" onChange={e => { if (e.target.value) add(e.target.value); e.target.value = '' }} defaultValue="">
            <option value="">Select known vehicle…</option>
            {KNOWN_VEHICLES.filter(v => !vehicles.includes(v)).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <span className="text-xs text-gray-600">or</span>
          <input className="input text-xs py-1 w-40" placeholder="Custom name…" value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === 'Enter' && add(custom)} />
          <button onClick={() => add(custom)} className="text-xs text-amber-400 hover:text-amber-300">Add</button>
          <button onClick={() => setAdding(false)} className="text-xs text-gray-600 hover:text-gray-400">Cancel</button>
        </div>
      )}
    </div>
  )
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsApi.getById(id!),
    enabled: !!id,
  })
  if (isLoading) return (
    <div className="flex justify-center mt-10"><Spinner size="lg" /></div>
  )
  if (error) return <ErrorBanner message="Failed to load client details." />
  const client = data?.data ?? data
  if (!client) return null

  const stats = client.performanceStats
  const submissions: any[] = client.submissionRecords ?? []
  const penalties: any[] = client.financialPenalties ?? []
  const certBadges = [
    { key: 'sdvosb', label: 'SDVOSB' },
    { key: 'wosb', label: 'WOSB' },
    { key: 'hubzone', label: 'HUBZone' },
    { key: 'smallBusiness', label: 'Small Business' },
  ].filter((b) => client[b.key])

  return (
    <div className="space-y-6 pb-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </button>
      <PageHeader title={client.name} subtitle={client.uei ? 'UEI: ' + client.uei : 'Client Company'} />

      {/* Company Profile */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-400" /> Company Profile
          <InfoTip text="Core identity and registration data. UEI and CAGE are used to verify SAM.gov eligibility. NAICS codes determine which solicitations the platform matches to this client." />
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          {client.uei && (<div><p className="text-gray-500 text-xs mb-0.5">UEI</p><p className="text-gray-200 font-mono">{client.uei}</p></div>)}
          {client.cage && (<div><p className="text-gray-500 text-xs mb-0.5">CAGE Code</p><p className="text-gray-200 font-mono">{client.cage}</p></div>)}
          {client.ein && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5 flex items-center gap-1"><CreditCard className="w-3 h-3" /> EIN / Tax ID</p>
              <p className="text-gray-200 font-mono">{client.ein}</p>
            </div>
          )}
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Platform Status</p>
            <span className={'text-xs px-2 py-0.5 rounded ' + (client.isActive ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300')}>
              {client.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {client.samRegStatus && (
            <div>
              <p className="text-gray-500 text-xs mb-0.5">SAM.gov Status</p>
              <span className={'text-xs px-2 py-0.5 rounded ' + (client.samRegStatus === 'Active' ? 'bg-green-900/40 text-green-300' : 'bg-yellow-900/40 text-yellow-300')}>
                {client.samRegStatus}
              </span>
              {client.samRegExpiry && (
                <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-0.5">
                  <CalendarClock className="w-3 h-3" /> Exp {new Date(client.samRegExpiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          )}
          {client.naicsCodes?.length > 0 && (
            <div className="col-span-2">
              <p className="text-gray-500 text-xs mb-1 flex items-center gap-1"><Hash className="w-3 h-3" /> NAICS Codes</p>
              <div className="flex flex-wrap gap-1">
                {client.naicsCodes.map((code: string) => (
                  <span key={code} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">{code}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contact & Address */}
        {(client.phone || client.website || client.streetAddress) && (
          <div className="border-t border-gray-800 pt-3 mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200">
                <Phone className="w-3.5 h-3.5 text-gray-600" /> {client.phone}
              </a>
            )}
            {client.website && (
              <a href={client.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 truncate max-w-xs">
                <Globe className="w-3.5 h-3.5" /> {client.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {client.streetAddress && (
              <span className="flex items-center gap-1.5 text-gray-400">
                <MapPin className="w-3.5 h-3.5 text-gray-600" />
                {client.streetAddress}{client.city ? `, ${client.city}` : ''}{client.state ? `, ${client.state}` : ''}{client.zipCode ? ` ${client.zipCode}` : ''}
              </span>
            )}
          </div>
        )}

        {certBadges.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {certBadges.map((b) => (
              <span key={b.key} className="flex items-center gap-1 text-xs bg-blue-900/40 text-blue-300 border border-blue-700 px-2 py-1 rounded">
                <Shield className="w-3 h-3" /> {b.label}
              </span>
            ))}
          </div>
        )}

        {/* Contract Vehicles */}
        <VehicleManager clientId={client.id} vehicles={client.contractVehicles ?? []} />
      </div>

      {/* Client Health Score + Performance Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Health Score */}
        {client.healthScore != null && (
          <div className="card flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="text-base font-semibold text-gray-200">Client Health Score</h2>
              <InfoTip text="Composite score (0–100) weighted across win rate (30%), on-time completion (25%), penalty-free status (25%), and SAM.gov registration health (20%). Above 70 is strong." />
            </div>
            <div className="text-center py-2">
              <p className={`text-6xl font-black font-mono ${client.healthScore >= 70 ? 'text-green-400' : client.healthScore >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                {client.healthScore}
              </p>
              <p className="text-xs text-gray-500 mt-1">out of 100</p>
              <div className="mt-3 w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${client.healthScore >= 70 ? 'bg-green-500' : client.healthScore >= 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${client.healthScore}%` }}
                />
              </div>
              <p className={`text-xs font-medium mt-2 ${client.healthScore >= 70 ? 'text-green-400' : client.healthScore >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                {client.healthScore >= 70 ? 'Strong standing' : client.healthScore >= 45 ? 'Needs attention' : 'At risk'}
              </p>
            </div>
          </div>
        )}

        {/* Performance Stats */}
        {stats && (
          <div className="card lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <h2 className="text-base font-semibold text-gray-200">Performance Summary</h2>
              <InfoTip text="Historical submission and contract performance. Win Rate is contracts awarded / total submitted. Completion Rate is on-time submissions. Penalties reduce the platform's win probability score for this client." />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs mb-0.5">Total Submissions</p>
                <p className="text-2xl font-bold font-mono text-gray-200">{stats.totalSubmitted ?? 0}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-0.5 flex items-center gap-1">On-Time Rate <InfoTip text="Percentage of proposals submitted before the agency deadline. Below 80% triggers risk flags." /></p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {(stats.completionRate ?? 0) >= 0.8 ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                  <p className="text-2xl font-bold font-mono text-gray-200">{Math.round((stats.completionRate ?? 0) * 100)}%</p>
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-0.5 flex items-center gap-1">Win Rate <InfoTip text="Contracts awarded as a percentage of total submitted. The platform uses this to calibrate your win probability scores via Bayesian updating." /></p>
                <p className={`text-2xl font-bold font-mono ${(stats.winRate ?? 0) >= 0.2 ? 'text-green-400' : (stats.winRate ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {Math.round((stats.winRate ?? 0) * 100)}%
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs mb-0.5 flex items-center gap-1">Total Penalties <InfoTip text="Cumulative financial penalties on record. Every $200K in penalties reduces the client's win probability by ~63% via exponential decay." /></p>
                <p className={`text-2xl font-bold font-mono ${(stats.totalPenalties ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {formatCurrency(stats.totalPenalties)}
                </p>
              </div>
              {(stats.totalWon > 0 || stats.totalLost > 0) && (
                <div className="col-span-2">
                  <p className="text-gray-500 text-xs mb-1">Win / Loss Record</p>
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 font-mono font-semibold">{stats.totalWon}W</span>
                    <span className="text-gray-600">–</span>
                    <span className="text-red-400 font-mono font-semibold">{stats.totalLost}L</span>
                    {stats.totalWon + stats.totalLost > 0 && (
                      <div className="flex-1 bg-gray-800 rounded-full h-1.5 max-w-24">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(stats.totalWon / (stats.totalWon + stats.totalLost)) * 100}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Submission Trend (6-month) */}
      {client.submissionTrend?.some((m: any) => m.submitted > 0) && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-blue-400" />
            <h2 className="text-base font-semibold text-gray-200">6-Month Submission Activity</h2>
            <InfoTip text="Monthly view of total proposals submitted, contracts won, and late submissions over the past 6 months. Helps spot seasonal patterns or a drop-off in bid activity." />
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={client.submissionTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => {
                const [y, m] = v.split('-')
                return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'short' })
              }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6', fontSize: 12 }}
                labelFormatter={(v) => {
                  const [y, m] = String(v).split('-')
                  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="submitted" name="Submitted" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="won" name="Won" fill="#22c55e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="late" name="Late" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bid Pipeline */}
      {client.pipeline && (client.pipeline.bidPrime.length > 0 || client.pipeline.bidSub.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-400" />
              <h2 className="text-base font-semibold text-gray-200">Active Bid Pipeline</h2>
              <InfoTip text="All current BID PRIME and BID SUB recommendations for this client. Pipeline value is the NPV-discounted expected revenue if each contract is won. Sorted by win probability." />
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span><span className="font-mono text-green-400">{client.pipeline.bidPrime.length}</span> Prime</span>
              <span><span className="font-mono text-blue-400">{client.pipeline.bidSub.length}</span> Sub</span>
              <span className="font-mono text-yellow-400">{formatCurrency(client.pipeline.totalPipelineValue)}</span>
            </div>
          </div>
          <div className="space-y-2">
            {[...client.pipeline.bidPrime, ...client.pipeline.bidSub]
              .sort((a: any, b: any) => Number(b.winProbability) - Number(a.winProbability))
              .slice(0, 10)
              .map((d: any) => {
                const daysLeft = d.opportunity?.responseDeadline
                  ? Math.round((new Date(d.opportunity.responseDeadline).getTime() - Date.now()) / 86400000)
                  : null
                const prob = Math.round(Number(d.winProbability) * 100)
                return (
                  <div key={d.id} className="flex items-center gap-3 border border-gray-800 rounded-lg px-3 py-2.5 hover:border-gray-700 transition-colors">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold flex-shrink-0 ${d.recommendation === 'BID_PRIME' ? 'bg-green-900/40 text-green-300' : 'bg-blue-900/40 text-blue-300'}`}>
                      {d.recommendation === 'BID_PRIME' ? 'PRIME' : 'SUB'}
                    </span>
                    <Link to={`/opportunities/${d.opportunity?.id}`} className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 hover:text-white truncate">{d.opportunity?.title ?? 'Unknown'}</p>
                      <p className="text-[10px] text-gray-500">{d.opportunity?.agency}</p>
                    </Link>
                    <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                      <span className={`font-mono font-semibold ${prob >= 50 ? 'text-green-400' : prob >= 30 ? 'text-yellow-400' : 'text-gray-400'}`}>{prob}%</span>
                      <span className="text-gray-600 font-mono">{formatCurrency(Number(d.expectedValue))}</span>
                      {daysLeft !== null && daysLeft >= 0 && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${daysLeft <= 7 ? 'bg-red-900/40 text-red-300' : daysLeft <= 20 ? 'bg-yellow-900/40 text-yellow-300' : 'bg-gray-800 text-gray-500'}`}>
                          {daysLeft}d
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
          {client.pipeline.bidPrime.length + client.pipeline.bidSub.length > 10 && (
            <p className="text-xs text-gray-600 mt-2 text-right">Showing top 10 by win probability</p>
          )}
        </div>
      )}

      {/* Recent Submissions */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" /> Recent Submissions
          <span className="text-xs text-gray-500 font-normal">(last 20)</span>
          <InfoTip text="Proposal submissions on record for this client. Status reflects the contracting officer's decision — AWARDED means the contract was won. Late submissions negatively affect the client's health score." />
        </h2>
        {submissions.length === 0 ? (
          <p className="text-gray-500 text-sm">No submissions on record yet.</p>
        ) : (
          <div className="space-y-2">
            {submissions.map((s: any) => (
              <div key={s.id} className="flex items-start justify-between border border-gray-800 rounded-lg px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  {s.opportunity ? (
                    <Link to={'/opportunities/' + s.opportunity.id} className="text-blue-400 hover:text-blue-300 font-medium truncate block">
                      {s.opportunity.title}
                    </Link>
                  ) : (<p className="text-gray-300 font-medium">Unknown Opportunity</p>)}
                  {s.opportunity?.agency && <p className="text-xs text-gray-500 mt-0.5">{s.opportunity.agency}</p>}
                  <p className="text-xs text-gray-600 mt-0.5">
                    Submitted {new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-4">
                  <span className={'text-xs px-2 py-0.5 rounded ' + (s.status === 'AWARDED' ? 'bg-green-900/40 text-green-300' : s.status === 'SUBMITTED' ? 'bg-blue-900/40 text-blue-300' : s.status === 'REJECTED' ? 'bg-red-900/40 text-red-300' : 'bg-gray-800 text-gray-400')}>
                    {s.status}
                  </span>
                  {s.wasOnTime === false && (<span className="text-xs text-red-400 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> Late</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Financial Penalties */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-red-400" /> Financial Penalties
          <span className="text-xs text-gray-500 font-normal">(last 10)</span>
          <InfoTip text="Recorded financial penalties (late delivery, non-compliance, etc.). Each $200K in total penalties reduces the platform's win probability estimate by ~63% via exponential decay — keeping this at zero is critical." />
        </h2>
        {penalties.length === 0 ? (
          <p className="text-gray-500 text-sm">No penalties on record. Good standing.</p>
        ) : (
          <div className="space-y-2">
            {penalties.map((p: any) => (
              <div key={p.id} className="flex items-start justify-between border border-red-900/30 rounded-lg px-4 py-3 text-sm">
                <div>
                  <p className="text-gray-300">{p.reason || 'Penalty'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Applied {new Date(p.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <p className="text-red-400 font-mono font-semibold flex-shrink-0 ml-4">{formatCurrency(p.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Matched Contracts */}
      <MatchedContractsSection clientId={id!} />

      {/* Portal Access — logins, reset password */}
      <PortalAccessSection clientId={id!} />

      {/* Portal Uploads from client */}
      <PortalUploadsSection clientId={id!} />

      {/* Company Documents */}
      <ClientDocumentsSection clientCompanyId={id!} />
    </div>
  )
}

// ── PORTAL ACCESS SECTION ──────────────────────────────────────
function PortalAccessSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient()
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [resetMsg, setResetMsg] = useState('')
  const [addingUser, setAddingUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const [addMsg, setAddMsg] = useState('')
  const [addError, setAddError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['portal-users', clientId],
    queryFn: () => clientPortalUsersApi.listByClient(clientId),
    enabled: !!clientId,
  })
  const users: any[] = data?.data ?? []

  const resetMutation = useMutation({
    mutationFn: () => clientPortalUsersApi.resetPassword(resetUserId!, newPassword),
    onSuccess: (res) => {
      setResetMsg(res.data?.message || 'Password updated')
      setNewPassword('')
      setTimeout(() => { setResetMsg(''); setResetUserId(null) }, 3000)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (userId: string) => clientPortalUsersApi.toggleActive(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-users', clientId] }),
  })

  const addMutation = useMutation({
    mutationFn: () => clientPortalUsersApi.register({ clientCompanyId: clientId, ...newUserForm }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-users', clientId] })
      setAddMsg(`Portal access created for ${newUserForm.email}`)
      setNewUserForm({ email: '', password: '', firstName: '', lastName: '' })
      setAddingUser(false)
      setTimeout(() => setAddMsg(''), 4000)
    },
    onError: (err: any) => setAddError(err?.response?.data?.error || 'Failed to create access'),
  })

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" /> Client Portal Access
          {users.length > 0 && (
            <span className="text-xs bg-amber-900/30 text-amber-400 border border-amber-700/40 px-2 py-0.5 rounded-full">
              {users.filter(u => u.isActive).length} active
            </span>
          )}
        </h2>
        <button
          onClick={() => { setAddingUser((v) => !v); setAddError('') }}
          className="flex items-center gap-1.5 text-xs btn-secondary"
        >
          <Plus className="w-3.5 h-3.5" /> Add Login
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Login credentials your client uses at <span className="text-amber-400/80">/client-login</span>.
        Use <strong className="text-slate-400">Reset Password</strong> to unlock a locked-out client — you set a temporary
        password and tell them what it is.
      </p>

      {addMsg && (
        <div className="mb-3 text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> {addMsg}
        </div>
      )}

      {/* Add new portal user form */}
      {addingUser && (
        <div className="rounded-xl mb-4 p-4 space-y-3" style={{ background: '#071120', border: '1px solid #1a2e4a' }}>
          <p className="text-xs font-semibold text-amber-400">New Portal Login</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name</label>
              <input className="input" value={newUserForm.firstName}
                onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={newUserForm.lastName}
                onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Email (their login username)</label>
            <input type="email" className="input" value={newUserForm.email}
              onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Initial Password</label>
            <input type="password" className="input" value={newUserForm.password}
              placeholder="Temporary password — they can change it later"
              onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })} />
          </div>
          {addError && <p className="text-red-400 text-xs">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setAddError(''); addMutation.mutate() }}
              disabled={!newUserForm.email || !newUserForm.password || !newUserForm.firstName || addMutation.isPending}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {addMutation.isPending ? 'Creating...' : 'Create Access'}
            </button>
            <button onClick={() => setAddingUser(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-slate-500 text-sm">Loading...</p>}

      {!isLoading && users.length === 0 && !addingUser && (
        <div className="text-center py-8 text-slate-600">
          <Lock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No portal accounts yet.</p>
          <p className="text-xs mt-0.5">Click "Add Login" to create client access.</p>
        </div>
      )}

      {users.length > 0 && (
        <div className="space-y-2">
          {users.map((u: any) => (
            <div key={u.id} className="rounded-xl px-4 py-3 transition-colors"
              style={{
                background: u.isActive ? '#071120' : 'rgba(30,30,30,0.4)',
                border: `1px solid ${u.isActive ? '#1a2e4a' : '#2a2a2a'}`,
                opacity: u.isActive ? 1 : 0.6,
              }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-200">
                      {u.firstName} {u.lastName}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      u.isActive
                        ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/40'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      {u.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </div>

                  {/* Email — the actual login credential */}
                  <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 rounded-lg w-fit"
                    style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <KeyRound className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-amber-300">{u.email}</span>
                    <span className="text-xs text-slate-600">· login email</span>
                  </div>

                  <div className="flex gap-4 mt-1.5 text-xs text-slate-600">
                    <span>Created {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {u.lastLoginAt
                      ? <span className="text-slate-500">Last login {new Date(u.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      : <span className="text-slate-700 italic">Never logged in</span>
                    }
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => { setResetUserId(u.id); setNewPassword(''); setResetMsg(''); setShowPw(false) }}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}
                  >
                    <RefreshCw className="w-3 h-3" /> Reset Password
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate(u.id)}
                    disabled={toggleMutation.isPending}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      u.isActive
                        ? 'text-red-400 hover:bg-red-900/20'
                        : 'text-emerald-400 hover:bg-emerald-900/20'
                    }`}
                    style={{ border: `1px solid ${u.isActive ? 'rgba(185,28,28,0.3)' : 'rgba(16,185,129,0.3)'}` }}
                  >
                    {u.isActive
                      ? <><UserX className="w-3 h-3" /> Suspend</>
                      : <><UserCheck className="w-3 h-3" /> Restore</>
                    }
                  </button>
                </div>
              </div>

              {/* Inline reset password form */}
              {resetUserId === u.id && (
                <div className="mt-3 pt-3 flex items-end gap-2" style={{ borderTop: '1px solid rgba(245,158,11,0.12)' }}>
                  <div className="flex-1">
                    <label className="label">New Temporary Password</label>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        className="input pr-9"
                        placeholder="Enter a temporary password for the client..."
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-400"
                      >
                        {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {resetMsg && <p className="text-emerald-400 text-xs mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {resetMsg}</p>}
                  </div>
                  <button
                    onClick={() => resetMutation.mutate()}
                    disabled={newPassword.length < 6 || resetMutation.isPending}
                    className="btn-primary text-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resetMutation.isPending ? 'animate-spin' : ''}`} />
                    {resetMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setResetUserId(null)} className="btn-secondary text-sm">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CLIENT DOCUMENTS SECTION ──────────────────────────────────
function ClientDocumentsSection({ clientCompanyId }: { clientCompanyId: string }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ documentType: 'CAPABILITY_STATEMENT', title: '', notes: '' })
  const [shareForm, setShareForm] = useState<{ docId: string; title: string; description: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['client-documents', clientCompanyId],
    queryFn: () => clientDocumentsApi.list(clientCompanyId),
    enabled: !!clientCompanyId,
  })

  const docs: any[] = data?.data ?? []

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => clientDocumentsApi.delete(docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-documents', clientCompanyId] }),
  })

  const shareMutation = useMutation({
    mutationFn: ({ docId, title, description }: { docId: string; title: string; description: string }) =>
      clientDocumentsApi.shareAsTemplate(docId, { title, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-documents', clientCompanyId] })
      setShareForm(null)
    },
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!form.title.trim()) { setUploadError('Please enter a title before uploading.'); return }
    setUploading(true); setUploadError('')
    try {
      await clientDocumentsApi.upload({ clientCompanyId, ...form }, file)
      qc.invalidateQueries({ queryKey: ['client-documents', clientCompanyId] })
      setForm({ documentType: 'CAPABILITY_STATEMENT', title: '', notes: '' })
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
        <BookMarked className="w-4 h-4 text-blue-400" /> Company Documents
        <InfoTip text="Branded documents for this client — Capability Statements, Past Performance write-ups, etc. The platform analyzes uploaded documents to compute the Document Alignment Score used in win probability calculations." />
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Upload branded documents (Capability Statements, Past Performance write-ups, etc.).
        You can anonymize and contribute any document to the shared Template Library.
      </p>

      {/* Upload form */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="label">Document Type</label>
            <select className="input" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title *</label>
            <input className="input" placeholder="e.g. Capability Statement 2025" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" placeholder="e.g. Used for VA contracts" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        {uploadError && <p className="text-red-400 text-xs mb-2">{uploadError}</p>}
        <input ref={fileRef} type="file" accept=".docx,.txt,.md" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => {
            if (!form.title.trim()) { setUploadError('Enter a title first'); return }
            setUploadError('')
            fileRef.current?.click()
          }}
          disabled={uploading}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {uploading
            ? <><Upload className="w-4 h-4 animate-pulse" /> Uploading...</>
            : <><Upload className="w-4 h-4" /> Choose File & Upload (.docx or .txt)</>}
        </button>
      </div>

      {/* Share as Template modal */}
      {shareForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-200 mb-1 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-blue-400" /> Contribute to Template Library
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Your document will be anonymized — company names, emails, phone numbers, and contract numbers are replaced with placeholders.
              It will be reviewed before becoming publicly available to all platform subscribers.
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Template Title *</label>
                <input className="input" value={shareForm.title} onChange={(e) => setShareForm({ ...shareForm, title: e.target.value })} placeholder="e.g. SDVOSB IT Capability Statement" />
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  className="input h-20 resize-none"
                  value={shareForm.description}
                  onChange={(e) => setShareForm({ ...shareForm, description: e.target.value })}
                  placeholder="What contract type, agency, or industry is this best suited for?"
                />
              </div>
              {shareMutation.isError && (
                <p className="text-red-400 text-xs">{(shareMutation.error as any)?.response?.data?.error || 'Submission failed'}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => shareMutation.mutate(shareForm)}
                  disabled={!shareForm.title.trim() || shareMutation.isPending}
                  className="btn-primary flex-1"
                >
                  {shareMutation.isPending ? 'Submitting...' : 'Anonymize & Submit for Review'}
                </button>
                <button onClick={() => setShareForm(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documents list */}
      {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}
      {!isLoading && docs.length === 0 && (
        <p className="text-gray-600 text-sm italic">No documents uploaded yet for this client.</p>
      )}
      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc: any) => (
            <div key={doc.id} className="flex items-start justify-between border border-gray-800 rounded-lg px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-gray-200 font-medium">{doc.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType} &middot; {doc.fileName} &middot; {(doc.fileSize / 1024).toFixed(0)} KB
                </p>
                {doc.notes && <p className="text-xs text-gray-600 mt-0.5 italic">{doc.notes}</p>}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                {doc.isSharedAsTemplate ? (
                  <span className="text-xs flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {doc.sharedTemplate?.status === 'APPROVED' ? 'In Library' : 'Pending Review'}
                  </span>
                ) : (
                  <button
                    onClick={() => setShareForm({ docId: doc.id, title: doc.title + ' Template', description: '' })}
                    title="Contribute to template library"
                    className="text-gray-600 hover:text-blue-400 transition-colors text-xs flex items-center gap-1"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                )}
                <button
                  onClick={() => clientDocumentsApi.download(doc.id, doc.fileName)}
                  className="text-gray-600 hover:text-blue-400 transition-colors"
                  title="Download"
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { if (window.confirm('Delete this document?')) deleteMutation.mutate(doc.id) }}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MATCHED CONTRACTS SECTION ──────────────────────────────────
const SET_ASIDE_LABELS: Record<string, string> = {
  NONE: 'Open', SMALL_BUSINESS: 'SB', SDVOSB: 'SDVOSB',
  WOSB: 'WOSB', HUBZONE: 'HUBZone', SBA_8A: '8(a)', TOTAL_SMALL_BUSINESS: 'TSB',
}

function MatchedContractsSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['client-opportunities', clientId],
    queryFn: () => clientOpportunitiesApi.getMatched(clientId),
    enabled: !!clientId,
  })
  const opps: any[] = data?.data ?? []

  const declineMutation = useMutation({
    mutationFn: (oppId: string) => clientOpportunitiesApi.decline(clientId, oppId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-opportunities', clientId] }),
  })
  const undeclineMutation = useMutation({
    mutationFn: (oppId: string) => clientOpportunitiesApi.undecline(clientId, oppId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-opportunities', clientId] }),
  })

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-blue-400" /> Matched Contracts
        <span className="text-xs text-gray-500 font-normal">(by NAICS code)</span>
        <InfoTip text="Active open solicitations where this client's NAICS codes directly match. Use Decline to suppress contracts not worth pursuing — they remain visible to the client as 'Not Pursuing' in their portal." />
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Active open solicitations matching this client's NAICS codes. Use <strong className="text-gray-400">Decline</strong> to grey out
        contracts not worth pursuing — they'll still be visible to the client as "Not Pursuing".
      </p>
      {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}
      {!isLoading && opps.length === 0 && (
        <p className="text-gray-600 text-sm italic">No active opportunities match this client's NAICS codes.</p>
      )}
      {opps.length > 0 && (
        <div className="space-y-2">
          {opps.map((opp: any) => (
            <div key={opp.id} className={`flex items-center gap-3 border rounded-lg px-4 py-3 transition-colors ${opp.isDeclined ? 'border-gray-800 opacity-50' : 'border-gray-800 hover:border-gray-600'}`}>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${opp.isDeclined ? 'text-gray-600 line-through' : 'text-gray-200'}`}>{opp.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {opp.agency} · NAICS {opp.naicsCode} · {SET_ASIDE_LABELS[opp.setAsideType] || opp.setAsideType}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-500">
                  {Math.round(opp.probabilityScore * 100)}% win
                </span>
                <span className="text-xs text-gray-600">
                  Due {new Date(opp.responseDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {opp.isDeclined ? (
                  <button
                    onClick={() => undeclineMutation.mutate(opp.id)}
                    disabled={undeclineMutation.isPending}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-400 border border-gray-700 hover:border-green-700 px-2 py-1 rounded transition-colors"
                    title="Restore — mark as worth pursuing again"
                  >
                    <RotateCcw className="w-3 h-3" /> Restore
                  </button>
                ) : (
                  <button
                    onClick={() => declineMutation.mutate(opp.id)}
                    disabled={declineMutation.isPending}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-800 px-2 py-1 rounded transition-colors"
                    title="Decline — grey out for this client"
                  >
                    <Ban className="w-3 h-3" /> Decline
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PORTAL UPLOADS SECTION ──────────────────────────────────────
function PortalUploadsSection({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['portal-uploads', clientId],
    queryFn: () => clientPortalApi.adminGetUploads(clientId),
    enabled: !!clientId,
  })
  const uploads: any[] = data?.data ?? []

  if (!isLoading && uploads.length === 0) return null

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
        <Upload className="w-4 h-4 text-purple-400" /> Files from Client Portal
        {uploads.length > 0 && <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded-full">{uploads.length}</span>}
      </h2>
      <p className="text-xs text-gray-500 mb-4">Documents uploaded by this client through their portal.</p>
      {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u: any) => (
            <div key={u.id} className="flex items-center gap-3 border border-gray-800 rounded-lg px-4 py-3">
              <FileText className="w-8 h-8 text-gray-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{u.title || u.fileName}</p>
                <p className="text-xs text-gray-500">{u.fileName} · {(u.fileSize / 1024).toFixed(0)} KB · {new Date(u.createdAt).toLocaleDateString()}</p>
                {u.notes && <p className="text-xs text-gray-500 italic">"{u.notes}"</p>}
              </div>
              <button
                onClick={() => clientPortalApi.adminDownloadUpload(clientId, u.id, u.fileName)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 border border-gray-700 hover:border-blue-700 px-2 py-1.5 rounded transition-colors flex-shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
