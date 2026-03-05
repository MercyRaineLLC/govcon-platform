import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../services/api'
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  formatCurrency,
} from '../components/ui'
import { RevenueForecast } from '../components/charts/RevenueForecast'
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
  Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Building2, Globe, ShieldCheck } from 'lucide-react'

const COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#eab308', '#ef4444', '#f97316', '#06b6d4']

export function AnalyticsPage() {
  const { data: miData, isLoading: miLoading } = useQuery({
    queryKey: ['market-intelligence'],
    queryFn: () => analyticsApi.marketIntelligence(),
  })

  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['portfolio-health'],
    queryFn: () => analyticsApi.portfolioHealth(),
  })

  const mi = miData?.data
  const health = healthData?.data

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

  return (
    <div>
      <PageHeader
        title="Deep Analytics"
        subtitle="Market intelligence, portfolio health, and competitive landscape"
      />

      {/* Portfolio Health Summary */}
      {health && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Expected Revenue</p>
            <p className="text-2xl font-bold text-green-400">
              {formatCurrency(health.totalExpectedRevenue)}
            </p>
            <p className="text-xs text-gray-500 mt-1">6-month Monte Carlo forecast</p>
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

        {/* Competitive Landscape */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-gray-200">Competitive Landscape</h3>
          </div>
          {!mi?.competitiveLandscape ? (
            <p className="text-sm text-gray-500 text-center py-8">No enrichment data available</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-400">
                    {mi.competitiveLandscape.totalEnrichedOpportunities}
                  </p>
                  <p className="text-[10px] text-gray-500">Enriched Opps</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-purple-400">
                    {mi.competitiveLandscape.avgCompetitors}
                  </p>
                  <p className="text-[10px] text-gray-500">Avg Competitors</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-yellow-400">
                    {mi.competitiveLandscape.recompetePercent}%
                  </p>
                  <p className="text-[10px] text-gray-500">Recompetes</p>
                </div>
              </div>

              {mi.competitiveLandscape.incumbentDominanceDistribution?.length > 0 && (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={mi.competitiveLandscape.incumbentDominanceDistribution}>
                    <XAxis dataKey="bucket" tick={{ fill: '#9ca3af', fontSize: 9 }} angle={-20} dy={5} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '6px',
                        color: '#f3f4f6',
                      }}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </>
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
                    <td className="py-2 pr-4 text-xs">{(a.smallBizRate * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4 text-xs">{(a.sdvosbRate * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-4 text-xs">{formatCurrency(a.avgAwardSize)}</td>
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
        <div className="card">
          <h3 className="font-semibold text-gray-200 mb-4">Set-Aside Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={health.diversification.setAsideDistribution}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="count"
                nameKey="type"
                label={({ type, percent }: any) => `${type} (${(percent * 100).toFixed(0)}%)`}
                labelLine={{ stroke: '#6b7280' }}
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
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default AnalyticsPage
