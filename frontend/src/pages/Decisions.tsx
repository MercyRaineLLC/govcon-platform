import { useQuery } from '@tanstack/react-query'
import { decisionsApi } from '../services/api'
import {
  PageHeader,
  Spinner,
  ErrorBanner,
  formatCurrency,
  ProbabilityBar,
} from '../components/ui'
import { Link } from 'react-router-dom'
import { ThumbsUp, ThumbsDown, Scale } from 'lucide-react'

const recStyles: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  BID_PRIME: { bg: 'bg-green-900/20', text: 'text-green-400', icon: ThumbsUp, label: 'BID PRIME' },
  BID_SUB: { bg: 'bg-blue-900/20', text: 'text-blue-400', icon: Scale, label: 'BID SUB' },
  NO_BID: { bg: 'bg-red-900/20', text: 'text-red-400', icon: ThumbsDown, label: 'NO BID' },
}

const complianceBadge: Record<string, string> = {
  APPROVED: 'bg-green-900 text-green-300',
  PENDING: 'bg-yellow-900 text-yellow-300',
  BLOCKED: 'bg-red-900 text-red-300',
  REJECTED: 'bg-gray-700 text-gray-400',
}

export function DecisionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['decisions'],
    queryFn: () => decisionsApi.list(),
  })

  const { data: metricsData } = useQuery({
    queryKey: ['decision-metrics'],
    queryFn: () => decisionsApi.metrics(),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center mt-20">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) return <ErrorBanner message="Failed to load decisions" />

  const decisions = data?.data || []
  const metrics = metricsData?.data

  // Count recommendations
  const bidPrime = decisions.filter((d: any) => d.recommendation === 'BID_PRIME').length
  const bidSub = decisions.filter((d: any) => d.recommendation === 'BID_SUB').length
  const noBid = decisions.filter((d: any) => d.recommendation === 'NO_BID').length

  return (
    <div>
      <PageHeader
        title="Bid Decisions"
        subtitle="AI-powered bid/no-bid recommendations with compliance status"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-100">{decisions.length}</p>
          <p className="text-xs text-gray-500">Total Decisions</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-400">{bidPrime}</p>
          <p className="text-xs text-gray-500">Bid Prime</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-blue-400">{bidSub}</p>
          <p className="text-xs text-gray-500">Bid Sub</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-400">{noBid}</p>
          <p className="text-xs text-gray-500">No Bid</p>
        </div>
      </div>

      {/* Decision List */}
      <div className="space-y-3">
        {decisions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p>No decisions yet. Run a portfolio evaluation to generate recommendations.</p>
          </div>
        ) : (
          decisions.map((d: any) => {
            const style = recStyles[d.recommendation] || recStyles.NO_BID
            const Icon = style.icon
            return (
              <div
                key={d.id}
                className={`rounded-lg p-4 ${style.bg} border border-gray-700`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-5 h-5 mt-0.5 ${style.text} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-bold ${style.text}`}>
                        {style.label}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          complianceBadge[d.complianceStatus] || 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        {d.complianceStatus}
                      </span>
                      {d.riskScore > 20 && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-900 text-red-300">
                          Risk: {d.riskScore}
                        </span>
                      )}
                    </div>

                    <Link
                      to={`/opportunities/${d.opportunity?.id}`}
                      className="text-sm text-blue-400 hover:text-blue-300 line-clamp-1 block mb-0.5"
                    >
                      {d.opportunity?.title || 'Unknown Opportunity'}
                    </Link>

                    <p className="text-xs text-gray-500">
                      {d.clientCompany?.name} · {d.opportunity?.agency}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Win Probability</p>
                        <ProbabilityBar probability={d.winProbability || 0} />
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Expected Value</p>
                        <p className="text-sm font-mono text-green-400">
                          {formatCurrency(Number(d.expectedValue || 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">ROI Ratio</p>
                        <p className={`text-sm font-mono ${d.roiRatio > 3 ? 'text-green-400' : d.roiRatio > 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {(d.roiRatio || 0).toFixed(1)}x
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Proposal Cost</p>
                        <p className="text-sm font-mono text-gray-400">
                          {formatCurrency(Number(d.proposalCostEstimate || 0))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default DecisionsPage
