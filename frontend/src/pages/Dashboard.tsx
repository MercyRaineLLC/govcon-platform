import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { firmApi, analyticsApi } from '../services/api'
import { OnboardingWizard, useOnboarding } from '../components/OnboardingWizard'
import {
  PageHeader,
  StatCard,
  DeadlineBadge,
  ProbabilityBar,
  formatCurrency,
  Spinner,
  ErrorBanner,
} from '../components/ui'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed'
import { useFavorites } from '../hooks/useFavorites'
import {
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Users,
  Target,
  Database,
  CheckCircle,
  BarChart3,
  LogOut,
  Clock,
  Star,
  X,
} from 'lucide-react'

// Charts
import { PipelineFunnel } from '../components/charts/PipelineFunnel'
import { WinProbabilityDistribution } from '../components/charts/WinProbabilityDistribution'
import { PenaltyTrendLine } from '../components/charts/PenaltyTrendLine'
import { SubmissionVelocity } from '../components/charts/SubmissionVelocity'
import { RevenueForecast } from '../components/charts/RevenueForecast'
import { ClientPortfolioPie } from '../components/charts/ClientPortfolioPie'

// Intelligence Cards
import { RiskRadarCard } from '../components/cards/RiskRadarCard'
import { OpportunityMatchCard } from '../components/cards/OpportunityMatchCard'
import { DecisionRecommendationCard } from '../components/cards/DecisionRecommendationCard'

export default function Dashboard() {
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)
  const { logout, user } = useAuth()
  const { items: recentItems, clearHistory } = useRecentlyViewed()
  const { favorites, removeFavorite } = useFavorites()
  const { showWizard, dismiss: dismissWizard } = useOnboarding()

  const handleSeedDemo = async () => {
    setSeeding(true)
    setSeedResult(null)
    try {
      const res = await firmApi.seedDemo()
      setSeedResult(`Seeded ${res.data.created} opportunities (${res.data.skipped} already existed). Run scoring to update probabilities.`)
    } catch (err: any) {
      setSeedResult('Seed failed: ' + (err?.response?.data?.error || err.message))
    } finally {
      setSeeding(false)
    }
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => firmApi.dashboard(),
    refetchInterval: 60_000,
  })

  const { data: trendsData } = useQuery({
    queryKey: ['analytics-trends'],
    queryFn: () => analyticsApi.trends(),
    refetchInterval: 300_000,
  })

  const { data: pipelineData } = useQuery({
    queryKey: ['analytics-pipeline'],
    queryFn: () => analyticsApi.pipeline(),
    refetchInterval: 300_000,
  })

  const { data: predictionsData } = useQuery({
    queryKey: ['analytics-predictions'],
    queryFn: () => analyticsApi.predictions(),
    refetchInterval: 300_000,
  })

  const { data: healthData } = useQuery({
    queryKey: ['analytics-portfolio-health'],
    queryFn: () => analyticsApi.portfolioHealth(),
    refetchInterval: 300_000,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center mt-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return <ErrorBanner message="Failed to load dashboard data" />
  }

  const d = data?.data
  const metrics = d?.firmMetrics
  const trends = trendsData?.data
  const pipeline = pipelineData?.data
  const predictions = predictionsData?.data
  const health = healthData?.data

  return (
    <div>
      {showWizard && <OnboardingWizard onDismiss={dismissWizard} />}
      <PageHeader
        title="Advisory Dashboard"
        subtitle="Real-time intelligence overview"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Load 8 realistic demo opportunities for testing"
          >
            {seeding ? <Spinner size="sm" /> : <Database className="w-4 h-4" />}
            {seeding ? 'Seeding...' : 'Load Demo Data'}
          </button>
          <Link to="/analytics" className="btn-secondary text-xs flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Deep Analytics
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </PageHeader>

      {seedResult && (
        <div className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 mb-4 ${
          seedResult.startsWith('Seed failed')
            ? 'bg-red-900/30 border border-red-700 text-red-300'
            : 'bg-green-900/20 border border-green-700 text-green-300'
        }`}>
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {seedResult}
        </div>
      )}

      {/* Quick Access: Favorites + Recently Viewed */}
      {(favorites.length > 0 || recentItems.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Favorites */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                <h2 className="font-semibold text-gray-200 text-sm">Starred Contracts</h2>
                <span className="text-xs bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded-full">
                  {favorites.length}
                </span>
              </div>
              <Link to="/opportunities" className="text-xs text-gray-600 hover:text-blue-400">
                All contracts →
              </Link>
            </div>
            {favorites.length === 0 ? (
              <p className="text-sm text-gray-600 py-2">
                Star a contract on any opportunity page to pin it here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {favorites.map((fav) => {
                  const daysLeft = Math.round((new Date(fav.deadline || '').getTime() - Date.now()) / 86400000)
                  return (
                    <div key={fav.id} className="group flex items-center gap-2">
                      <Link
                        to={`/opportunities/${fav.id}`}
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-800 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-yellow-300 truncate">{fav.title}</p>
                          <p className="text-[10px] text-gray-500 truncate">{fav.agency}</p>
                        </div>
                        {fav.deadline && daysLeft >= 0 && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                            daysLeft <= 7 ? 'bg-red-900/40 text-red-300' :
                            daysLeft <= 20 ? 'bg-yellow-900/40 text-yellow-300' :
                            'bg-gray-800 text-gray-500'
                          }`}>
                            {daysLeft}d
                          </span>
                        )}
                      </Link>
                      <button
                        onClick={() => removeFavorite(fav.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all flex-shrink-0"
                        title="Remove from favorites"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recently Viewed */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-200 text-sm">Recently Viewed</h2>
              </div>
              {recentItems.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            {recentItems.length === 0 ? (
              <p className="text-sm text-gray-600 py-2">
                Open any contract to start building your history.
              </p>
            ) : (
              <div className="space-y-1.5">
                {recentItems.map((item) => {
                  const daysLeft = Math.round((new Date(item.deadline || '').getTime() - Date.now()) / 86400000)
                  return (
                    <Link
                      key={item.id}
                      to={`/opportunities/${item.id}`}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-800 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-300 group-hover:text-white truncate">{item.title}</p>
                        <p className="text-[10px] text-gray-500 truncate">{item.agency}</p>
                      </div>
                      {item.deadline && daysLeft >= 0 && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                          daysLeft <= 7 ? 'bg-red-900/40 text-red-300' :
                          daysLeft <= 20 ? 'bg-yellow-900/40 text-yellow-300' :
                          'bg-gray-800 text-gray-500'
                        }`}>
                          {daysLeft}d
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Active Clients"
          value={metrics?.totalClients ?? 0}
          sub="Consulting relationships"
          color="blue"
        />
        <StatCard
          label="Pipeline Value"
          value={formatCurrency(d?.pipelineValue?.totalExpected ?? 0)}
          sub={`${d?.totalOpportunities ?? 0} opportunities`}
          color="green"
        />
        <StatCard
          label="Avg Win Probability"
          value={`${Math.round((d?.avgWinProbability ?? 0) * 100)}%`}
          sub="Across all decisions"
          color={(d?.avgWinProbability ?? 0) >= 0.4 ? 'green' : 'yellow'}
        />
        <StatCard
          label="Completion Rate"
          value={`${Math.round((metrics?.aggregateCompletionRate ?? 0) * 100)}%`}
          sub="On-time submissions"
          color={(metrics?.aggregateCompletionRate ?? 0) >= 0.8 ? 'green' : 'yellow'}
        />
        <StatCard
          label="Penalties (30d)"
          value={formatCurrency(d?.recentPenalties?.total ?? 0)}
          sub={`${d?.recentPenalties?.count ?? 0} events`}
          color={d?.recentPenalties?.total > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Deadline Alert Banner */}
      {(d?.deadlineAlerts?.red > 0 || d?.deadlineAlerts?.yellow > 0) && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">Deadline Alerts</p>
            <p className="text-sm text-gray-400 mt-0.5">
              {d.deadlineAlerts.red > 0 && (
                <span className="text-red-300">
                  {d.deadlineAlerts.red} critical (7d)
                </span>
              )}
              {d.deadlineAlerts.red > 0 && d.deadlineAlerts.yellow > 0 && ' · '}
              {d.deadlineAlerts.yellow > 0 && (
                <span className="text-yellow-300">
                  {d.deadlineAlerts.yellow} elevated (20d)
                </span>
              )}
            </p>
          </div>
          <Link
            to="/opportunities?sortBy=deadline"
            className="ml-auto btn-secondary text-xs py-1"
          >
            View All
          </Link>
        </div>
      )}

      {/* Row 2: Pipeline + Win Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <PipelineFunnel stages={pipeline?.stages || []} />
        <WinProbabilityDistribution data={d?.probDistribution} />
      </div>

      {/* Row 3: Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <PenaltyTrendLine data={trends?.penalties} />
        <SubmissionVelocity data={trends?.submissions} />
      </div>

      {/* Row 4: Intelligence Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <OpportunityMatchCard suggestions={predictions?.opportunitySuggestions} />
        <RiskRadarCard risks={predictions?.riskItems} />
        <DecisionRecommendationCard decisions={d?.recentDecisions} />
      </div>

      {/* Row 5: Revenue Forecast */}
      <div className="mb-8">
        <RevenueForecast data={health?.revenueForecast} />
      </div>

      {/* Row 6: Top Opportunities + Client Portfolio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Opportunities */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-gray-200">
              Top Opportunities by Expected Value
            </h2>
          </div>

          <div className="space-y-4">
            {d?.topOpportunities?.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No scored opportunities yet
              </p>
            )}

            {d?.topOpportunities?.map((opp: any) => (
              <div
                key={opp.id}
                className="border-b border-gray-800 pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-start justify-between mb-1">
                  <Link
                    to={`/opportunities/${opp.id}`}
                    className="text-sm font-medium text-blue-400 hover:text-blue-300 line-clamp-1 flex-1 mr-2"
                  >
                    {opp.title}
                  </Link>
                  <DeadlineBadge
                    priority={
                      opp.deadline.daysUntil <= 7
                        ? 'RED'
                        : opp.deadline.daysUntil <= 20
                        ? 'YELLOW'
                        : 'GREEN'
                    }
                    label={`${opp.deadline.daysUntil}d`}
                  />
                </div>

                <p className="text-xs text-gray-500 mb-2">{opp.agency}</p>

                <div className="flex items-center">
                  <ProbabilityBar probability={opp.probabilityScore || 0} />
                </div>

                {/* Bid decision badges */}
                {opp.bidDecisions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {opp.bidDecisions.map((bd: any, i: number) => (
                      <span
                        key={i}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          bd.recommendation === 'BID_PRIME'
                            ? 'bg-green-900/40 text-green-300'
                            : bd.recommendation === 'BID_SUB'
                            ? 'bg-blue-900/40 text-blue-300'
                            : 'bg-red-900/40 text-red-300'
                        }`}
                      >
                        {bd.recommendation} - {bd.clientCompany?.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <ClientPortfolioPie clients={metrics?.clientBreakdown} />
      </div>
    </div>
  )
}
