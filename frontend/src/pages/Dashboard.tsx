import { useQuery } from '@tanstack/react-query'
import { firmApi } from '../services/api'
import {
  PageHeader,
  StatCard,
  DeadlineBadge,
  ProbabilityBar,
  formatCurrency,
  Spinner,
  ErrorBanner
} from '../components/ui'
import { Link } from 'react-router-dom'
import { TrendingUp, AlertTriangle, DollarSign, Users } from 'lucide-react'

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => firmApi.dashboard(),
    refetchInterval: 60_000,
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

  return (
    <div>
      <PageHeader
        title="Advisory Dashboard"
        subtitle="Real-time intelligence overview"
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Clients"
          value={metrics?.totalClients ?? 0}
          sub="Consulting relationships"
          color="blue"
        />
        <StatCard
          label="Completion Rate"
          value={`${Math.round((metrics?.aggregateCompletionRate ?? 0) * 100)}%`}
          sub="On-time submissions"
          color={(metrics?.aggregateCompletionRate ?? 0) >= 0.8 ? 'green' : 'yellow'}
        />
        <StatCard
          label="CRITICAL Deadlines"
          value={d?.deadlineAlerts?.red ?? 0}
          sub="≤ 7 days remaining"
          color={d?.deadlineAlerts?.red > 0 ? 'red' : 'default'}
        />
        <StatCard
          label="Penalties (30d)"
          value={formatCurrency(d?.recentPenalties?.total ?? 0)}
          sub={`${d?.recentPenalties?.count ?? 0} penalty events`}
          color={d?.recentPenalties?.total > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Deadline Alert Banner */}
      {(d?.deadlineAlerts?.red > 0 || d?.deadlineAlerts?.yellow > 0) && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">
              Deadline Alerts
            </p>
            <p className="text-sm text-gray-400 mt-0.5">
              {d.deadlineAlerts.red > 0 && (
                <span className="text-red-300">
                  {d.deadlineAlerts.red} critical (≤7 days)
                </span>
              )}
              {d.deadlineAlerts.red > 0 && d.deadlineAlerts.yellow > 0 && ' • '}
              {d.deadlineAlerts.yellow > 0 && (
                <span className="text-yellow-300">
                  {d.deadlineAlerts.yellow} elevated (≤20 days)
                </span>
              )}
            </p>
          </div>
          <Link
            to="/opportunities?sortBy=deadline"
            className="ml-auto btn-secondary text-xs py-1"
          >
            View All →
          </Link>
        </div>
      )}

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
                No scored opportunities yet. Run an ingestion.
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

                <p className="text-xs text-gray-500 mb-2">
                  {opp.agency}
                </p>

                <div className="flex items-center justify-between">
                  <ProbabilityBar probability={opp.probabilityScore || 0} />
                  <span className="text-xs font-mono text-green-400 ml-3">
                    EV: {formatCurrency(opp.expectedValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Client Performance */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-gray-200">
              Client Performance
            </h2>
          </div>

          <div className="space-y-3">
            {metrics?.clientBreakdown?.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No clients yet.
              </p>
            )}

            {metrics?.clientBreakdown?.map((client: any) => (
              <div key={client.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-300">
                    {client.name}
                  </p>
                  <ProbabilityBar probability={client.completionRate} />
                </div>

                {client.totalPenalties > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <DollarSign className="w-3 h-3" />
                    {formatCurrency(client.totalPenalties)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}