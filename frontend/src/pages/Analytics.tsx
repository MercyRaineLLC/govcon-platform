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

  const { data: bqSnapshotData, isLoading: bqSnapshotLoading } = useQuery({
    queryKey: ['bq-snapshot'],
    queryFn: () => marketAnalyticsApi.snapshot(),
    enabled: bqStatusData?.data?.hasData === true,
    retry: false,
  })

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
          {health && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="card">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Expected Revenue</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatCurrency(health.totalExpectedRevenue)}
                </p>
                <p className="text-xs text-gray-500 mt-1">6-month forward projection</p>
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

                  {/* NAICS heatmap */}
                  {bqSnapshotData.data.heatmap?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">NAICS Competition Heatmap</h4>
                      <div className="space-y-2">
                        {bqSnapshotData.data.heatmap.map((h: any) => (
                          <div key={h.naicsCode} className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 w-16 flex-shrink-0">{h.naicsCode}</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(h.concentration * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500 w-24 text-right flex-shrink-0">
                              {h.awards} awards · {formatCurrency(h.avgAmount)}
                            </span>
                            {h.avgOffers != null && (
                              <span className="text-[10px] text-yellow-500 w-20 text-right flex-shrink-0">
                                ~{h.avgOffers.toFixed(1)} offerors
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2">Bar width = winner concentration (HHI). Wider = fewer firms dominate.</p>
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
                            {bqSnapshotData.data.topAgencies.map((a: any) => (
                              <tr key={a.agency} className="border-b border-gray-800/50 text-gray-300">
                                <td className="py-1.5 pr-6 text-gray-200">{a.agency}</td>
                                <td className="py-1.5 pr-6 text-right">{a.awards.toLocaleString()}</td>
                                <td className="py-1.5 text-right">{formatCurrency(a.amount)}</td>
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
    </div>
  )
}

export default AnalyticsPage
