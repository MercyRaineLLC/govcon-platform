import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../services/api'
import {
  PageHeader,
  Spinner,
  ErrorBanner,
} from '../components/ui'
import { ShieldCheck, ArrowRight } from 'lucide-react'

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
        subtitle="Track all compliance state transitions with full audit trail"
      />

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
            Page {pagination.page} of {pagination.pages} ({pagination.total} total)
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p>No compliance log entries found</p>
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
                  <tr key={log.id} className="border-b border-gray-800">
                    <td className="py-3 pr-4 text-xs text-gray-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                        {log.entityType}
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
                      {log.reason || '-'}
                    </td>
                    <td className="py-3 text-xs text-gray-400">
                      {log.triggeredBy || 'System'}
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
