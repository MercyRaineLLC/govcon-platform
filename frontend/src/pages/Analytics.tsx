import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi, marketAnalyticsApi } from '../services/api'
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  formatCurrency,
} from '../components/ui'
import { RevenueForecast } from '../components/charts/RevenueForecast'
import { TierGate } from '../components/TierGate'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  ComposedChart,
  ErrorBar,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Globe,
  Info,
  Database,
  Zap,
  AlertCircle,
} from 'lucide-react'

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#eab308', '#ef4444', '#f97316', '#06b6d4']

function transitionColor(probability: number): string {
  if (probability > 0.5) return 'text-green-400'
  if (probability >= 0.2) return 'text-yellow-400'
  return 'text-red-400'
}

function transitionBg(probability: number): string {
  if (probability > 0.5) return 'bg-green-900/30 border-green-700'
  if (probability >= 0.2) return 'bg-yellow-900/30 border-yellow-700'
  return 'bg-red-900/30 border-red-700'
}

/**
 * Export a market snapshot to CSV. Rolls together heatmap rows + agencies
 * into two CSV sections so the consultant can drop it straight into Excel.
 */
function exportSnapshotCsv(data: any, yearsBack: number) {
  if (!data) return
  const rows: string[] = []
  rows.push(`# MrGovCon Deep Market Intelligence — ${yearsBack}-year snapshot`)
  rows.push(`# Exported ${new Date().toISOString()}`)
  rows.push(`# Total market volume: $${Math.round(data.totalOpportunityVolume).toLocaleString()}`)
  rows.push(`# Avg contract size: $${Math.round(data.avgContractSize).toLocaleString()}`)
  rows.push(`# Unique competitors: ${data.competitorCount}`)
  rows.push('')
  rows.push('NAICS Heatmap')
  rows.push('naicsCode,awards,avgAmount,uniqueWinners,avgOffers,concentrationHHI,myActiveOpps,myExpectedValue')
  for (const h of data.heatmap || []) {
    rows.push([
      h.naicsCode,
      h.awards,
      Math.round(h.avgAmount),
      h.uniqueWinners ?? '',
      h.avgOffers != null ? h.avgOffers.toFixed(2) : '',
      (h.concentration ?? 0).toFixed(3),
      h.myActiveOpps ?? 0,
      Math.round(h.myExpectedValue ?? 0),
    ].join(','))
  }
  rows.push('')
  rows.push('Top Agencies')
  rows.push('agency,awards,totalAmount')
  for (const a of (data.topAgencies || []).filter((a: any) => a.agency && a.agency.toUpperCase() !== 'ALL')) {
    rows.push([`"${String(a.agency).replace(/"/g, '""')}"`, a.awards, Math.round(a.amount)].join(','))
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `market-snapshot-${yearsBack}y-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Tiny inline SVG sparkline. Values = quarterly award counts, oldest → newest.
 * Bars rather than line so single-point upticks are visible.
 */
function Sparkline({ values, width = 60, height = 20 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length === 0) return null
  const max = Math.max(...values, 1)
  const barW = width / values.length
  const last = values[values.length - 1]
  const prev = values[values.length - 2] ?? 0
  const trendUp = last > prev
  return (
    <svg width={width} height={height} className="flex-shrink-0" aria-label="trend">
      {values.map((v, i) => {
        const h = max > 0 ? (v / max) * height : 0
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={height - h}
            width={Math.max(barW - 1, 1)}
            height={Math.max(h, 0.5)}
            fill={trendUp ? '#34d399' : '#818cf8'}
            opacity={0.7}
          />
        )
      })}
    </svg>
  )
}

export function AnalyticsPage() {
  const { data: miData, isLoading: miLoading } = useQuery({
    queryKey: ['market-intelligence'],
    queryFn: () => analyticsApi.marketIntelligence(),
  })

  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['portfolio-health'],
    queryFn: () => analyticsApi.portfolioHealth(),
  })

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ['pipeline-analysis'],
    queryFn: () => analyticsApi.pipelineAnalysis(),
  })

  const { data: bqStatusData } = useQuery({
    queryKey: ['bq-status'],
    queryFn: () => marketAnalyticsApi.status(),
    retry: false,
  })

  const [yearsBack, setYearsBack] = useState<1 | 3 | 5 | 10>(5)
  const { data: bqSnapshotData, isLoading: bqSnapshotLoading } = useQuery({
    queryKey: ['bq-snapshot', yearsBack],
    queryFn: () => marketAnalyticsApi.snapshot({ years: yearsBack }),
    enabled: bqStatusData?.data?.hasData === true,
    retry: false,
  })

  const { data: bqInsightsData } = useQuery({
    queryKey: ['bq-insights'],
    queryFn: () => marketAnalyticsApi.insights(),
    enabled: bqStatusData?.data?.hasData === true,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  // NAICS drill-down modal state
  const [drillNaics, setDrillNaics] = useState<string | null>(null)
  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ['bq-naics-drill', drillNaics],
    queryFn: () => marketAnalyticsApi.competition(drillNaics!),
    enabled: !!drillNaics,
  })

  // Agency drill-down modal state
  const [drillAgency, setDrillAgency] = useState<string | null>(null)
  const { data: agencyData, isLoading: agencyLoading } = useQuery({
    queryKey: ['bq-agency-drill', drillAgency],
    queryFn: () => marketAnalyticsApi.agency(drillAgency!),
    enabled: !!drillAgency,
  })

  // NAICS compare state — pick up to 2 NAICS to compare side-by-side
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  const compareA = compareSelection[0] ?? null
  const compareB = compareSelection[1] ?? null
  const { data: compareDataA } = useQuery({
    queryKey: ['bq-compare', compareA],
    queryFn: () => marketAnalyticsApi.competition(compareA!),
    enabled: !!compareA,
  })
  const { data: compareDataB } = useQuery({
    queryKey: ['bq-compare', compareB],
    queryFn: () => marketAnalyticsApi.competition(compareB!),
    enabled: !!compareB,
  })
  const toggleCompare = (naics: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(naics)) return prev.filter((n) => n !== naics)
      if (prev.length >= 2) return [prev[1], naics]   // FIFO: drop oldest, keep newest two
      return [...prev, naics]
    })
  }

  const mi = miData?.data
  const health = healthData?.data
  const pipeline = pipelineData?.data

  if (miLoading && healthLoading) {
    return (
      <div className="flex justify-center mt-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const trendIcon = (trend: string) => {
    if (trend === 'growing') return <TrendingUp className="w-3.5 h-3.5 text-green-400" />
    if (trend === 'declining') return <TrendingDown className="w-3.5 h-3.5 text-red-400" />
    return <Minus className="w-3.5 h-3.5 text-gray-400" />
  }

  // Prepare agency win rate chart data
  const agencyChartData = (pipeline?.agencyWinRates ?? []).map((a: any) => ({
    agency: a.agency.length > 15 ? a.agency.slice(0, 15) + '…' : a.agency,
    winRatePct: Math.round(a.winRate * 100),
    wins: a.wins,
    n: a.n,
    ciLower: Math.round(a.ciLower * 100),
    ciUpper: Math.round(a.ciUpper * 100),
    errorBounds: [
      Math.round((a.winRate - a.ciLower) * 100),
      Math.round((a.ciUpper - a.winRate) * 100),
    ],
    ciRange: `${Math.round(a.ciLower * 100)}% – ${Math.round(a.ciUpper * 100)}%`,
  }))

  return (
    <div>
      <PageHeader
        title="Deep Analytics"
        subtitle="Market intelligence, portfolio health, and competitive landscape"
      />

      {/* Portfolio Health Summary */}
      <TierGate feature="analytics" requiredTier="professional">
        <>
          {/* Revenue forecast explainer */}
          <div className="mb-6 px-4 py-3 rounded-lg flex items-start gap-3"
            style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-200 space-y-1">
              <p className="font-semibold text-blue-300">How Expected Revenue & Forecasting Work</p>
              <p>
                <span className="text-green-400 font-medium">Expected Revenue</span> is your probability-weighted pipeline value — each open opportunity's contract value multiplied by its calculated win probability, summed across all active bids. It represents the statistically likely revenue if you pursued every active opportunity to award.
              </p>
              <p>
                The <span className="text-blue-300 font-medium">Revenue Forecast chart</span> projects this forward across 6 months using three scenarios: <span className="text-green-400">Optimistic</span> (your best-case pipeline closes at higher values), <span className="text-blue-400">Expected</span> (probability-weighted midpoint — your planning baseline), and <span className="text-red-400">Conservative</span> (only your highest-confidence bids close at the lower end of their value range).
              </p>
              <p className="text-yellow-400/80 text-[11px] italic">
                These are planning projections, not guarantees. Accuracy is highest 1–3 months out and improves as your firm builds a longer award track record on this platform.
              </p>
            </div>
          </div>

          {health && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="card">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Expected Revenue</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatCurrency(health.totalExpectedRevenue)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Probability-weighted pipeline · 6-mo projection</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">NAICS Concentration</p>
                <p className="text-2xl font-bold text-blue-400">
                  {(health.diversification?.naicsConcentration * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">HHI index (lower = more diverse)</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Top Client Dependency</p>
                <p className={`text-2xl font-bold ${health.riskIndicators?.singleClientDependency > 50 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {health.riskIndicators?.singleClientDependency}%
                </p>
                <p className="text-xs text-gray-500 mt-1">Pipeline from top client</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Late Submission Rate</p>
                <p className={`text-2xl font-bold ${health.riskIndicators?.overdueSubmissionRate > 20 ? 'text-red-400' : 'text-green-400'}`}>
                  {health.riskIndicators?.overdueSubmissionRate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Avg {health.riskIndicators?.avgDaysToDeadlineAtSubmission}d before deadline
                </p>
              </div>
            </div>
          )}

          {/* Revenue Forecast */}
          <div className="mb-8">
            <RevenueForecast data={health?.revenueForecast} />
          </div>
        </>
      </TierGate>

      {/* NAICS Sector Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-purple-400" />
            <h3 className="font-semibold text-gray-200">NAICS Sector Trends</h3>
          </div>
          {!mi?.naicsTrends?.length ? (
            <p className="text-sm text-gray-500 text-center py-8">No NAICS data available</p>
          ) : (
            <div className="space-y-2">
              {mi.naicsTrends.map((s: any) => (
                <div
                  key={s.naicsCode}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-800/50"
                >
                  {trendIcon(s.trend)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-200">{s.sector}</span>
                      <span className="text-xs text-gray-500">NAICS {s.naicsCode}xx</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {s.opportunityCount} opps · Avg {formatCurrency(s.avgEstimatedValue)} · {s.avgCompetitionCount} competitors
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      s.trend === 'growing'
                        ? 'bg-green-900/40 text-green-300'
                        : s.trend === 'declining'
                        ? 'bg-red-900/40 text-red-300'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {s.trend}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Agency Profiles */}
      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-200">Agency Profiles</h3>
        </div>
        {!mi?.agencyProfiles?.length ? (
          <p className="text-sm text-gray-500 text-center py-8">No agency data available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                  <th className="pb-2 pr-4">Agency</th>
                  <th className="pb-2 pr-4">Opps</th>
                  <th className="pb-2 pr-4">Small Biz %</th>
                  <th className="pb-2 pr-4">SDVOSB %</th>
                  <th className="pb-2 pr-4">Avg Award</th>
                  <th className="pb-2">Top Incumbents</th>
                </tr>
              </thead>
              <tbody>
                {mi.agencyProfiles.map((a: any) => (
                  <tr key={a.agency} className="border-b border-gray-800 text-gray-300">
                    <td className="py-2 pr-4 font-medium text-xs">{a.agency}</td>
                    <td className="py-2 pr-4 text-xs">{a.totalOpportunities}</td>
                    <td className="py-2 pr-4 text-xs">{a.smallBizRate > 0 ? `${(a.smallBizRate * 100).toFixed(0)}%` : '—'}</td>
                    <td className="py-2 pr-4 text-xs">{a.sdvosbRate > 0 ? `${(a.sdvosbRate * 100).toFixed(0)}%` : '—'}</td>
                    <td className="py-2 pr-4 text-xs">{a.avgAwardSize > 0 ? formatCurrency(a.avgAwardSize) : '—'}</td>
                    <td className="py-2 text-xs text-gray-400">
                      {a.topIncumbents.map((t: any) => t.name).join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Set-Aside Distribution */}
      {health?.diversification?.setAsideDistribution?.length > 0 && (
        <div className="card mb-8">
          <h3 className="font-semibold text-gray-200 mb-4">Set-Aside Distribution</h3>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-shrink-0">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={health.diversification.setAsideDistribution}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="count"
                    nameKey="type"
                  >
                    {health.diversification.setAsideDistribution.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '6px',
                      color: '#f3f4f6',
                    }}
                    formatter={(value: any, _name: any, props: any) => [
                      `${value} (${props.payload.percent}%)`,
                      props.payload.type,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* External legend */}
            <div className="flex flex-col gap-2 flex-1">
              {health.diversification.setAsideDistribution.map((entry: any, i: number) => (
                <div key={entry.type} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-xs text-gray-300 flex-1">{entry.type}</span>
                  <span className="text-xs text-gray-400">{entry.count} ({entry.percent}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pipeline Conversion + Win Rate CI ── */}
      <div className="card mb-8 border border-gray-800">
        <h3 className="font-semibold text-gray-200 mb-6">
          Pipeline Conversion Analysis
        </h3>

        {pipelineLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !pipeline ? (
          <ErrorBanner message="Failed to load pipeline analysis data." />
        ) : (
          <>
            {/* Stage flow */}
            <div className="flex items-center gap-1 flex-wrap mb-6">
              {(pipeline.markovChain ?? []).map((stage: any, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  {i === 0 && (
                    <div className="px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-xs font-medium text-gray-300">
                      {stage.from}
                      <span className="block text-[10px] text-gray-500 font-normal">
                        {stage.fromCount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div
                    className={`flex flex-col items-center px-2 py-1 rounded border text-xs font-bold ${transitionBg(stage.probability)}`}
                  >
                    <span className={transitionColor(stage.probability)}>
                      {Math.round(stage.probability * 100)}%
                    </span>
                    <span className="text-gray-500 text-[9px] font-normal">→</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-xs font-medium text-gray-300">
                    {stage.to}
                    <span className="block text-[10px] text-gray-500 font-normal">
                      {stage.toCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Expected yield callout */}
            <div className="mb-8 px-4 py-4 rounded-lg bg-blue-900/20 border border-blue-800">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300">
                  <span className="font-medium text-gray-100">Expected Pipeline Yield: </span>
                  For every 100 new opportunities ingested, our analysis predicts{' '}
                  <span className="font-bold text-blue-300">
                    {(pipeline.expectedWinsPerHundred ?? 0).toFixed(1)}
                  </span>{' '}
                  will be won based on your historical conversion rates.
                </p>
              </div>
            </div>

            {/* Agency Win Rate with CI */}
            {agencyChartData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                Need at least 2 submissions per agency to compute confidence intervals.
              </p>
            ) : (
              <>
                <h4 className="text-sm font-semibold text-gray-300 mb-3">
                  Agency Win Rate with Confidence Range
                </h4>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={agencyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                    <XAxis
                      dataKey="agency"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      angle={-35}
                      dy={10}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '6px',
                        color: '#f3f4f6',
                        fontSize: '12px',
                      }}
                      formatter={(value: any, name: string, props: any) => {
                        if (name === 'winRatePct') {
                          const d = props.payload
                          return [
                            `${value}% (CI: ${d.ciRange}) — ${d.wins}W / ${d.n} total`,
                            'Win Rate',
                          ]
                        }
                        return [value, name]
                      }}
                    />
                    <Bar dataKey="winRatePct" fill="#3b82f6" radius={[4, 4, 0, 0]} name="winRatePct">
                      {agencyChartData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                      <ErrorBar dataKey="errorBounds" width={4} strokeWidth={2} stroke="#60a5fa" />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-gray-500 mt-2 text-center">
                  Error bars show the statistical confidence range. Agencies with fewer than 2 submissions are excluded.
                </p>
              </>
            )}
          </>
        )}
      </div>
      {/* ── Deep Market Intelligence ── */}
      <TierGate feature="deep_market_intel" requiredTier="enterprise">
        <div className="card mb-8 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <h3 className="font-semibold text-gray-200">Deep Market Intelligence</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/40 text-indigo-300 border border-indigo-800">
                Historical Data
              </span>
            </div>
            {bqStatusData?.data && (
              <div className={`flex items-center gap-1.5 text-xs ${bqStatusData.data.connected ? 'text-green-400' : 'text-red-400'}`}>
                <span className={`w-2 h-2 rounded-full ${bqStatusData.data.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                {bqStatusData.data.connected ? `${bqStatusData.data.awardRows.toLocaleString()} award records` : 'Not connected'}
              </div>
            )}
          </div>

          {/* No data state */}
          {!bqStatusData?.data?.hasData && (
            <div className="py-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-gray-600 mx-auto" />
              <p className="text-sm text-gray-400">No award history loaded yet.</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Historical award data from USAspending powers competitive intelligence, agency profiling,
                and market trend analysis. Contact your administrator to enable this feature.
              </p>
            </div>
          )}

          {/* Insight bar — algorithmic plain-English recommendations */}
          {bqStatusData?.data?.hasData && bqInsightsData?.data && bqInsightsData.data.length > 0 && (
            <div className="mb-5 space-y-2">
              {bqInsightsData.data.map((ins: any, i: number) => {
                const palette = ins.level === 'OPPORTUNITY'
                  ? { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.30)', text: '#4ade80', label: 'OPPORTUNITY' }
                  : ins.level === 'RISK'
                    ? { bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.30)', text: '#f87171', label: 'RISK' }
                    : { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.30)', text: '#a5b4fc', label: 'NOTE' }
                return (
                  <div key={i} className="rounded-lg p-3 flex gap-3"
                    style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                    <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded h-fit flex-shrink-0"
                      style={{ background: palette.border, color: palette.text }}>
                      {palette.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: palette.text }}>{ins.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{ins.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Data available: market snapshot */}
          {bqStatusData?.data?.hasData && (
            <>
              {bqSnapshotLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : bqSnapshotData?.data ? (
                <>
                  {/* Top-line metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Market Volume</p>
                      <p className="text-lg font-bold text-indigo-400">
                        {formatCurrency(bqSnapshotData.data.totalOpportunityVolume)}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Avg Contract Size</p>
                      <p className="text-lg font-bold text-blue-400">
                        {formatCurrency(bqSnapshotData.data.avgContractSize)}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Unique Competitors</p>
                      <p className="text-lg font-bold text-purple-400">
                        {bqSnapshotData.data.competitorCount.toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">NAICS Codes Tracked</p>
                      <p className="text-lg font-bold text-yellow-400">
                        {bqSnapshotData.data.naicsCodes.length}
                      </p>
                    </div>
                  </div>

                  {/* Date range selector + export */}
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">NAICS Competition Heatmap</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => exportSnapshotCsv(bqSnapshotData?.data, yearsBack)}
                        className="text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                        title="Download the heatmap as CSV"
                      >
                        Export CSV
                      </button>
                      <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {[1, 3, 5, 10].map((y) => (
                          <button
                            key={y}
                            onClick={() => setYearsBack(y as 1 | 3 | 5 | 10)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                              yearsBack === y ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            {y}Y
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* NAICS heatmap — clickable rows with sparklines + portfolio overlay */}
                  {bqSnapshotData.data.heatmap?.length > 0 && (
                    <div className="mb-6">
                      <div className="space-y-1">
                        {bqSnapshotData.data.heatmap.map((h: any) => (
                          <div key={h.naicsCode}
                            className={`flex items-center gap-3 w-full px-2 py-1.5 rounded transition-colors group cursor-pointer ${
                              compareSelection.includes(h.naicsCode) ? 'bg-emerald-900/20' : 'hover:bg-indigo-900/20'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={compareSelection.includes(h.naicsCode)}
                              onChange={() => toggleCompare(h.naicsCode)}
                              onClick={(e) => e.stopPropagation()}
                              className="cursor-pointer flex-shrink-0"
                              title="Add to compare (max 2)"
                            />
                            <button
                              type="button"
                              onClick={() => setDrillNaics(h.naicsCode)}
                              className="flex items-center gap-3 flex-1 text-left"
                            >
                            <span className="text-xs text-indigo-300 group-hover:text-indigo-200 font-mono w-16 flex-shrink-0">{h.naicsCode}</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500 group-hover:bg-indigo-400 transition-colors"
                                style={{ width: `${Math.min(h.concentration * 100, 100)}%` }}
                              />
                            </div>
                            {/* Sparkline (last N quarters of award counts) */}
                            {Array.isArray(h.trendBuckets) && h.trendBuckets.length > 0 && (
                              <Sparkline values={h.trendBuckets} width={60} height={20} />
                            )}
                            <span className="text-[10px] text-gray-500 w-24 text-right flex-shrink-0">
                              {h.awards} awards · {formatCurrency(h.avgAmount)}
                            </span>
                            {h.avgOffers != null && (
                              <span className="text-[10px] text-yellow-500 w-20 text-right flex-shrink-0">
                                ~{h.avgOffers.toFixed(1)} offerors
                              </span>
                            )}
                            {/* Portfolio overlay */}
                            {h.myActiveOpps > 0 && (
                              <span className="text-[10px] text-emerald-400 w-24 text-right flex-shrink-0 font-mono"
                                title="Your active opps in this NAICS · probability-weighted value">
                                you: {h.myActiveOpps} · {formatCurrency(h.myExpectedValue ?? 0)}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-600 group-hover:text-indigo-400 w-12 text-right flex-shrink-0">
                              View →
                            </span>
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2">
                        Bar width = winner concentration (HHI). Sparkline = quarterly award trend. Green = your firm's active pipeline. Check up to 2 boxes to compare side-by-side. Click any row to drill in.
                      </p>

                      {/* Side-by-side compare panel */}
                      {compareSelection.length === 2 && compareDataA?.data && compareDataB?.data && (
                        <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.25)' }}>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Side-by-Side Comparison</h4>
                            <button onClick={() => setCompareSelection([])} className="text-[11px] text-gray-500 hover:text-gray-200">clear</button>
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-[10px] text-gray-500 border-b border-gray-700">
                                <th className="pb-2 pr-4">Metric</th>
                                <th className="pb-2 pr-4 text-right text-indigo-300 font-mono">{compareA}</th>
                                <th className="pb-2 text-right text-emerald-300 font-mono">{compareB}</th>
                              </tr>
                            </thead>
                            <tbody className="text-gray-300">
                              {([
                                ['Total Awards', compareDataA.data.totalAwards, compareDataB.data.totalAwards, (n: number) => n.toLocaleString()],
                                ['Total $', compareDataA.data.totalAmount, compareDataB.data.totalAmount, (n: number) => formatCurrency(n)],
                                ['Avg Award', compareDataA.data.avgAwardAmount, compareDataB.data.avgAwardAmount, (n: number) => formatCurrency(n)],
                                ['Median Award', compareDataA.data.medianAwardAmount, compareDataB.data.medianAwardAmount, (n: number) => formatCurrency(n)],
                                ['Unique Winners', compareDataA.data.uniqueWinners, compareDataB.data.uniqueWinners, (n: number) => n.toLocaleString()],
                                ['Avg Offerors', compareDataA.data.avgOffersReceived, compareDataB.data.avgOffersReceived, (n: number | null) => n != null ? n.toFixed(1) : '—'],
                                ['Concentration HHI', compareDataA.data.winnerConcentrationHHI, compareDataB.data.winnerConcentrationHHI, (n: number) => n.toFixed(3)],
                                ['Top Winner', compareDataA.data.topWinners?.[0]?.name, compareDataB.data.topWinners?.[0]?.name, (s: string) => s ?? '—'],
                                ['Top Winner Share', compareDataA.data.topWinners?.[0]?.shareOfWins, compareDataB.data.topWinners?.[0]?.shareOfWins, (n: number) => n != null ? `${(n * 100).toFixed(1)}%` : '—'],
                              ] as Array<[string, any, any, (v: any) => string]>).map(([label, a, b, fmt]) => (
                                <tr key={label} className="border-b border-gray-800/50">
                                  <td className="py-1.5 pr-4 text-gray-400">{label}</td>
                                  <td className="py-1.5 pr-4 text-right font-mono">{fmt(a)}</td>
                                  <td className="py-1.5 text-right font-mono">{fmt(b)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {compareSelection.length === 1 && (
                        <p className="text-[10px] text-emerald-400 mt-2">Pick one more NAICS to enable side-by-side comparison.</p>
                      )}
                    </div>
                  )}

                  {/* Top agencies from BQ */}
                  {bqSnapshotData.data.topAgencies?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Top Contracting Agencies (by award count)
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] text-gray-500 border-b border-gray-700">
                              <th className="pb-2 pr-6">Agency</th>
                              <th className="pb-2 pr-6 text-right">Awards</th>
                              <th className="pb-2 text-right">Total Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bqSnapshotData.data.topAgencies
                              .filter((a: any) => a.agency && a.agency.trim() && a.agency.trim().toUpperCase() !== 'ALL')
                              .map((a: any) => (
                                <tr
                                  key={a.agency}
                                  onClick={() => setDrillAgency(a.agency)}
                                  className="border-b border-gray-800/50 text-gray-300 hover:bg-indigo-900/20 cursor-pointer transition-colors"
                                >
                                  <td className="py-1.5 pr-6 text-indigo-300 hover:text-indigo-200">{a.agency}</td>
                                  <td className="py-1.5 pr-6 text-right font-mono">{a.awards.toLocaleString()}</td>
                                  <td className="py-1.5 text-right font-mono">{formatCurrency(a.amount)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-6">No snapshot data returned.</p>
              )}
            </>
          )}
        </div>
      </TierGate>

      {/* ── NAICS Drill-Down Modal ── */}
      {drillNaics && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDrillNaics(null)}
        >
          <div
            className="rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
            style={{ background: '#0b1628', border: '1px solid rgba(99,102,241,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-gray-800 flex items-center justify-between"
              style={{ background: '#0b1628' }}>
              <div>
                <h3 className="text-base font-semibold text-gray-100">NAICS {drillNaics}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Historical award profile from USAspending</p>
              </div>
              <button
                onClick={() => setDrillNaics(null)}
                className="text-gray-500 hover:text-gray-200 text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5">
              {drillLoading && <div className="flex justify-center py-8"><Spinner /></div>}
              {!drillLoading && drillData?.data && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Awards</p>
                      <p className="text-lg font-bold text-indigo-400">{drillData.data.totalAwards?.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total $</p>
                      <p className="text-lg font-bold text-blue-400">{formatCurrency(drillData.data.totalAmount ?? 0)}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Avg Award</p>
                      <p className="text-lg font-bold text-purple-400">{formatCurrency(drillData.data.avgAwardAmount ?? 0)}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Unique Winners</p>
                      <p className="text-lg font-bold text-yellow-400">{drillData.data.uniqueWinners?.toLocaleString()}</p>
                    </div>
                  </div>

                  {drillData.data.topWinners?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Top Winners</h4>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[10px] text-gray-500 border-b border-gray-700">
                            <th className="pb-2 pr-4">Recipient</th>
                            <th className="pb-2 pr-4 text-right">Wins</th>
                            <th className="pb-2 pr-4 text-right">Total $</th>
                            <th className="pb-2 text-right">Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drillData.data.topWinners.slice(0, 10).map((w: any) => (
                            <tr key={w.name} className="border-b border-gray-800/50 text-gray-300">
                              <td className="py-1.5 pr-4 truncate max-w-xs text-gray-200">{w.name}</td>
                              <td className="py-1.5 pr-4 text-right font-mono">{w.wins}</td>
                              <td className="py-1.5 pr-4 text-right font-mono">{formatCurrency(w.totalAmount)}</td>
                              <td className="py-1.5 text-right font-mono text-amber-400">{(w.shareOfWins * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {drillData.data.setAsideBreakdown?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Set-Aside Breakdown</h4>
                      <div className="space-y-1.5">
                        {drillData.data.setAsideBreakdown.slice(0, 8).map((s: any) => (
                          <div key={s.type} className="flex items-center gap-3 text-xs">
                            <span className="w-32 text-gray-300 truncate">{s.type || '(unspecified)'}</span>
                            <div className="flex-1 bg-gray-800 rounded h-3 overflow-hidden">
                              <div className="h-full bg-purple-500" style={{ width: `${s.pct}%` }} />
                            </div>
                            <span className="w-20 text-right text-gray-500 font-mono">{s.pct.toFixed(1)}% ({s.count})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {drillData.data.yearlySummary?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Awards by Year</h4>
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                        {drillData.data.yearlySummary.map((y: any) => (
                          <div key={y.year} className="bg-gray-800/50 rounded p-2 text-center">
                            <p className="text-[10px] text-gray-500">{y.year}</p>
                            <p className="text-xs font-semibold text-gray-200">{y.awards}</p>
                            <p className="text-[9px] text-indigo-400 font-mono">{formatCurrency(y.totalAmount)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!drillLoading && !drillData?.data && (
                <p className="text-sm text-gray-500 text-center py-6">No data found for NAICS {drillNaics}.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Agency Drill-Down Modal ── */}
      {drillAgency && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDrillAgency(null)}
        >
          <div
            className="rounded-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
            style={{ background: '#0b1628', border: '1px solid rgba(99,102,241,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-gray-800 flex items-center justify-between"
              style={{ background: '#0b1628' }}>
              <div>
                <h3 className="text-base font-semibold text-gray-100">{drillAgency}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Agency buying profile · set-aside affinity · top NAICS</p>
              </div>
              <button onClick={() => setDrillAgency(null)} className="text-gray-500 hover:text-gray-200 text-2xl leading-none px-2">×</button>
            </div>

            <div className="px-6 py-5">
              {agencyLoading && <div className="flex justify-center py-8"><Spinner /></div>}
              {!agencyLoading && agencyData?.data && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Awards</p>
                      <p className="text-lg font-bold text-indigo-400">{agencyData.data.totalAwards?.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total $</p>
                      <p className="text-lg font-bold text-blue-400">{formatCurrency(agencyData.data.totalAmount ?? 0)}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Avg Award</p>
                      <p className="text-lg font-bold text-purple-400">{formatCurrency(agencyData.data.avgAwardAmount ?? 0)}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Competitiveness</p>
                      <p className={`text-lg font-bold ${agencyData.data.competitiveness === 'HIGH' ? 'text-green-400' : agencyData.data.competitiveness === 'LOW' ? 'text-red-400' : 'text-yellow-400'}`}>
                        {agencyData.data.competitiveness}
                      </p>
                    </div>
                  </div>

                  {/* Set-aside affinity */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Set-Aside Affinity (% of awards)</h4>
                    <div className="space-y-1.5">
                      {[
                        { label: 'Small Business', rate: agencyData.data.smallBizRate, color: '#3b82f6' },
                        { label: 'SDVOSB', rate: agencyData.data.sdvosbRate, color: '#10b981' },
                        { label: 'WOSB', rate: agencyData.data.wosbRate, color: '#a855f7' },
                        { label: 'HUBZone', rate: agencyData.data.hubzoneRate, color: '#f59e0b' },
                      ].map((s) => (
                        <div key={s.label} className="flex items-center gap-3 text-xs">
                          <span className="w-32 text-gray-300">{s.label}</span>
                          <div className="flex-1 bg-gray-800 rounded h-3 overflow-hidden">
                            <div className="h-full" style={{ width: `${(s.rate ?? 0) * 100}%`, background: s.color }} />
                          </div>
                          <span className="w-16 text-right text-gray-500 font-mono">{((s.rate ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top NAICS at this agency */}
                  {agencyData.data.topNaicsCodes?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Top NAICS Codes Bought</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {agencyData.data.topNaicsCodes.map((n: any) => (
                          <button
                            key={n.naics}
                            onClick={() => { setDrillAgency(null); setTimeout(() => setDrillNaics(n.naics), 50) }}
                            className="bg-gray-800/50 rounded p-2 text-left hover:bg-indigo-900/30 transition-colors group"
                          >
                            <p className="text-[10px] text-gray-500 group-hover:text-indigo-400">NAICS</p>
                            <p className="text-sm font-mono text-indigo-300 group-hover:text-indigo-200">{n.naics}</p>
                            <p className="text-[10px] text-gray-500">{n.count} awards</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!agencyLoading && !agencyData?.data && (
                <p className="text-sm text-gray-500 text-center py-6">No data found for this agency.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnalyticsPage
