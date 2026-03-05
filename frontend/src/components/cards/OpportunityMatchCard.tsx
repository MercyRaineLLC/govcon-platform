import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { formatCurrency, ProbabilityBar } from '../ui'

interface MatchSuggestion {
  opportunityId: string
  opportunityTitle: string
  agency: string
  clientName: string
  matchScore: number
  winProbability: number
  expectedValue: number
  matchReasons: string[]
  daysToDeadline: number
}

export function OpportunityMatchCard({ suggestions }: { suggestions?: MatchSuggestion[] }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-purple-400" />
        <h3 className="font-semibold text-gray-200">Smart Matches</h3>
      </div>

      <div className="space-y-3 max-h-72 overflow-y-auto">
        {!suggestions || suggestions.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No match suggestions available. Run portfolio evaluation first.
          </p>
        ) : (
          suggestions.slice(0, 6).map((s, i) => (
            <div
              key={i}
              className="border border-gray-700 rounded-md p-3 hover:border-purple-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-1">
                <Link
                  to={`/opportunities/${s.opportunityId}`}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 line-clamp-1 flex-1 mr-2"
                >
                  {s.opportunityTitle}
                </Link>
                <span className="text-xs font-bold text-purple-400 flex-shrink-0">
                  {s.matchScore}%
                </span>
              </div>

              <p className="text-[11px] text-gray-500 mb-1.5">
                {s.agency} &middot; {s.clientName} &middot; {s.daysToDeadline}d left
              </p>

              <ProbabilityBar probability={s.winProbability} />

              <div className="flex flex-wrap gap-1 mt-2">
                {s.matchReasons.slice(0, 3).map((reason, j) => (
                  <span
                    key={j}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-300"
                  >
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
