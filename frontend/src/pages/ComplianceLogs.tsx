import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../services/api'
import {
  PageHeader,
  Spinner,
  ErrorBanner,
} from '../components/ui'
import { ShieldCheck, ArrowRight, FileText, GitBranch, Clock, Info } from 'lucide-react'

const statusColor: Record<string, string> = {
  APPROVED: 'bg-green-900 text-green-300',
  PENDING: 'bg-yellow-900 text-yellow-300',
  BLOCKED: 'bg-red-900 text-red-300',
  REJECTED: 'bg-gray-700 text-gray-400',
}

export function ComplianceLogsPage() {
  const [entityType, setEntityType] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['compliance-logs', entityType, page],
    queryFn: () =>
      analyticsApi.complianceLogs({
        entityType: entityType || undefined,
        page,
        limit: 25,
      }),
  })

  if (error) return <ErrorBanner message="Failed to load compliance logs" />

  const logs = data?.data?.logs || []
  const pagination = data?.data?.pagination

  return (
    <div>
      <PageHeader
        title="Compliance Audit Log"
        subtitle="Full history of every compliance status change across your firm"
      />

      {/* Explanation cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card flex gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-200 mb-1">What is this page?</p>
            <p className="text-xs text-gray-500">
              Every time a bid decision or submission changes compliance status — automatically or manually —
              an immutable log entry is created. This gives you a full audit trail for regulatory review.
            </p>
          </div>
        </div>
        <div className="card flex gap-3">
          <GitBranch className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-200 mb-1">Status transitions</p>
            <p className="text-xs text-gray-500">
              Entries show the <span className="text-yellow-300">from → to</span> status transition.
              System-triggered transitions happen automatically (e.g. when a decision is evaluated).
              Manual transitions require ADMIN role.
            </p>
          </div>
        </div>
        <div className="card flex gap-3">
          <Clock className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-200 mb-1">When does it populate?</p>
            <p className="text-xs text-gray-500">
              Log entries are created when you run the Decision Engine on an opportunity, manually change
              a bid decision status, or when a submission record status changes. Run decisions to start
              generating audit history.
            </p>
          </div>
        </div>
      </div>

      {/* Status key */}
      <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-gray-900/50 rounded-lg border border-gray-800">
        <span className="text-xs text-gray-500 flex items-center gap-1"><Info className="w-3 h-3" /> Status key:</span>
        {Object.entries(statusColor).map(([s, cls]) => (
          <span key={s} className={`text-[10px] px-2 py-0.5 rounded ${cls}`}>{s}</span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value)
            setPage(1)
          }}
          className="input text-sm w-48"
        >
          <option value="">All Entity Types</option>
          <option value="SUBMISSION">Submissions</option>
          <option value="BID_DECISION">Bid Decisions</option>
        </select>

        {pagination && (
          <span className="text-xs text-gray-500 ml-auto">
            Page {pagination.page} of {pagination.pages} ({pagination.total} total entries)
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-700 rounded-lg">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 font-medium mb-2">No audit entries yet</p>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Compliance log entries are created when you run the Decision Engine on opportunities
            (Opportunities → select an opp → Run Decision) or when submission statuses are updated.
            Once activity begins, all state transitions appear here with full timestamps and reasons.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                  <th className="pb-2 pr-4">Timestamp</th>
                  <th className="pb-2 pr-4">Entity Type</th>
                  <th className="pb-2 pr-4">Transition</th>
                  <th className="pb-2 pr-4">Reason</th>
                  <th className="pb-2">Triggered By</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-900/40">
                    <td className="py-3 pr-4 text-xs text-gray-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 flex items-center gap-1 w-fit">
                        {log.entityType === 'BID_DECISION' ? <FileText className="w-3 h-3" /> : <GitBranch className="w-3 h-3" />}
                        {log.entityType === 'BID_DECISION' ? 'Bid Decision' : log.entityType}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {log.fromStatus && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              statusColor[log.fromStatus] || 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {log.fromStatus}
                          </span>
                        )}
                        <ArrowRight className="w-3 h-3 text-gray-500" />
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            statusColor[log.toStatus] || 'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {log.toStatus}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs text-gray-400 max-w-xs truncate">
                      {log.reason || <span className="text-gray-600 italic">—</span>}
                    </td>
                    <td className="py-3 text-xs text-gray-400">
                      {log.triggeredBy ? (
                        <span className="bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded text-[10px]">{log.triggeredBy}</span>
                      ) : (
                        <span className="text-gray-600 italic">System</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-400">
                {page} / {pagination.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ComplianceLogsPage
