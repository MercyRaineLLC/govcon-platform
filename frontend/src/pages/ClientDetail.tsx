import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clientsApi } from '../services/api'
import { PageHeader, Spinner, ErrorBanner, formatCurrency } from '../components/ui'
import {
  ArrowLeft, Shield, CheckCircle, XCircle, AlertTriangle,
  FileText, DollarSign, TrendingUp, Building2, Hash,
} from 'lucide-react'

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

      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-400" /> Company Profile
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          {client.uei && (<div><p className="text-gray-500 text-xs mb-0.5">UEI</p><p className="text-gray-200 font-mono">{client.uei}</p></div>)}
          {client.cage && (<div><p className="text-gray-500 text-xs mb-0.5">CAGE Code</p><p className="text-gray-200 font-mono">{client.cage}</p></div>)}
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Status</p>
            <span className={'text-xs px-2 py-0.5 rounded ' + (client.isActive ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300')}>
              {client.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
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
        {certBadges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {certBadges.map((b) => (
              <span key={b.key} className="flex items-center gap-1 text-xs bg-blue-900/40 text-blue-300 border border-blue-700 px-2 py-1 rounded">
                <Shield className="w-3 h-3" /> {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {stats && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> Performance Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500 text-xs mb-0.5">Submissions</p>
              <p className="text-2xl font-bold font-mono text-gray-200">{stats.totalSubmitted ?? 0}</p></div>
            <div><p className="text-gray-500 text-xs mb-0.5">Completion Rate</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {(stats.completionRate ?? 0) >= 0.8 ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <p className="text-2xl font-bold font-mono text-gray-200">{Math.round((stats.completionRate ?? 0) * 100)}%</p>
              </div>
            </div>
            <div><p className="text-gray-500 text-xs mb-0.5">Win Rate</p>
              <p className="text-2xl font-bold font-mono text-green-400">{Math.round((stats.winRate ?? 0) * 100)}%</p></div>
            <div><p className="text-gray-500 text-xs mb-0.5">Total Penalties</p>
              <p className={'text-2xl font-bold font-mono ' + ((stats.totalPenalties ?? 0) > 0 ? 'text-red-400' : 'text-gray-400')}>
                {formatCurrency(stats.totalPenalties)}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" /> Recent Submissions
          <span className="text-xs text-gray-500 font-normal">(last 20)</span>
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
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-red-400" /> Financial Penalties
          <span className="text-xs text-gray-500 font-normal">(last 10)</span>
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
    </div>
  )
}
