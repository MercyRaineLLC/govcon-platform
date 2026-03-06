import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { stateMunicipalApi } from '../services/api'
import { PageHeader, Spinner, EmptyState, ErrorBanner, formatCurrency } from '../components/ui'
import { MapPin, Building2, Lock, Globe, Filter } from 'lucide-react'
import { format } from 'date-fns'

const LEVEL_LABELS: Record<string, string> = {
  STATE: 'State', MUNICIPAL: 'Municipal', COUNTY: 'County', FEDERAL: 'Federal',
}

const LEVEL_COLORS: Record<string, string> = {
  STATE: 'bg-blue-900/30 text-blue-300 border-blue-700',
  MUNICIPAL: 'bg-purple-900/30 text-purple-300 border-purple-700',
  COUNTY: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
  FEDERAL: 'bg-green-900/30 text-green-300 border-green-700',
}

export function StateMunicipalPage() {
  const [filters, setFilters] = useState({ state: '', contractLevel: '', page: 1 })

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ['sm-subscription'],
    queryFn: stateMunicipalApi.subscription,
  })

  const { data: statsData } = useQuery({
    queryKey: ['sm-stats'],
    queryFn: stateMunicipalApi.stats,
    enabled: subData?.subscription?.isActive === true,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['sm-opportunities', filters],
    queryFn: () => stateMunicipalApi.opportunities({
      state: filters.state || undefined,
      contractLevel: filters.contractLevel || undefined,
      page: filters.page, limit: 25,
    }),
    enabled: subData?.subscription?.isActive === true,
  })

  if (subLoading) return <Spinner />
  const sub = subData?.subscription
  const isActive = sub?.isActive === true
  if (!isActive) {
    return (
      <div className='min-h-screen bg-gray-950 text-gray-100'>
        <div className='max-w-4xl mx-auto px-6 py-16 text-center'>
          <div className='inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-900/30 border border-purple-700 mb-6'>
            <Lock className='w-10 h-10 text-purple-400' />
          </div>
          <h1 className='text-3xl font-bold text-white mb-3'>State &amp; Municipal Contracts</h1>
          <p className='text-gray-400 text-lg mb-8'>
            Unlock access to thousands of state, municipal, and county contract opportunities
            beyond the federal marketplace.
          </p>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-10'>
            {[{ label: 'State Portals', desc: 'All 50 state procurement portals' },
              { label: 'Municipal Bids', desc: 'City and county solicitations' },
              { label: 'Auto-Scoring', desc: 'Win probability on every contract' },
            ].map((f) => (
              <div key={f.label} className='bg-gray-900 border border-gray-800 rounded-lg p-4'>
                <div className='text-purple-400 font-semibold mb-1'>{f.label}</div>
                <div className='text-gray-400 text-sm'>{f.desc}</div>
              </div>
            ))}
          </div>
          <div className='bg-gray-900 border border-purple-700/50 rounded-xl p-8'>
            <h2 className='text-xl font-semibold text-white mb-4'>Add-On Pricing</h2>
            <div className='flex items-center justify-center gap-8 mb-6'>
              <div className='text-center'>
                <div className='text-3xl font-bold text-white'>$299<span className='text-lg font-normal text-gray-400'>/mo</span></div>
                <div className='text-sm text-gray-400 mt-1'>State Only</div>
              </div>
              <div className='text-center'>
                <div className='text-3xl font-bold text-purple-400'>$499<span className='text-lg font-normal text-gray-400'>/mo</span></div>
                <div className='text-sm text-gray-400 mt-1'>State + Municipal</div>
              </div>
            </div>
            <button className='bg-purple-600 hover:bg-purple-500 text-white font-semibold px-8 py-3 rounded-lg transition-colors'>
              Contact Sales to Activate
            </button>
            <p className='text-xs text-gray-500 mt-3'>14-day free trial available. No credit card required.</p>
          </div>
        </div>
      </div>
    )
  }

  const stats = statsData?.stats
  const opps = data?.opportunities || []
  const pagination = data?.pagination

  return (
    <div className='min-h-screen bg-gray-950 text-gray-100'>
      <div className='max-w-7xl mx-auto px-6 py-8'>
        <PageHeader
          title='State &amp; Municipal Contracts'
          subtitle={`Active · ${sub?.tier === 'FULL' ? 'State + Municipal' : 'State Only'} · ${sub?.statesEnabled?.length || 0} states enabled`}
        />
        {stats && (
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-6'>
            <div className='bg-gray-900 border border-gray-800 rounded-lg p-4'>
              <div className='text-2xl font-bold text-white'>{stats.total}</div>
              <div className='text-xs text-gray-400 mt-0.5'>Active Opportunities</div>
            </div>
            <div className='bg-gray-900 border border-gray-800 rounded-lg p-4'>
              <div className='text-2xl font-bold text-orange-400'>{stats.expiringSoon}</div>
              <div className='text-xs text-gray-400 mt-0.5'>Expiring in 14 Days</div>
            </div>
            {stats.byLevel?.slice(0, 2).map((l: any) => (
              <div key={l.contractLevel} className='bg-gray-900 border border-gray-800 rounded-lg p-4'>
                <div className='text-2xl font-bold text-blue-400'>{l._count}</div>
                <div className='text-xs text-gray-400 mt-0.5'>{LEVEL_LABELS[l.contractLevel] || l.contractLevel} Contracts</div>
              </div>
            ))}
          </div>
        )}
        <div className='flex gap-3 mb-5'>
          <div className='relative'>
            <Filter className='absolute left-2.5 top-2.5 w-4 h-4 text-gray-500' />
            <select className='bg-gray-900 border border-gray-700 text-sm text-gray-200 rounded pl-8 pr-3 py-2'
              value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value, page: 1 })}>
              <option value=''>All States</option>
              {['VA','MD','DC','TX','CA','FL','NY','PA','OH','GA'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <select className='bg-gray-900 border border-gray-700 text-sm text-gray-200 rounded px-3 py-2'
            value={filters.contractLevel} onChange={(e) => setFilters({ ...filters, contractLevel: e.target.value, page: 1 })}>
            <option value=''>All Levels</option>
            <option value='STATE'>State</option>
            <option value='MUNICIPAL'>Municipal</option>
            <option value='COUNTY'>County</option>
          </select>
        </div>
        {isLoading ? <Spinner /> : error ? (
          <ErrorBanner message={(error as any)?.response?.data?.error || 'Failed to load'} />
        ) : opps.length === 0 ? (
          <EmptyState message='No contracts found. Adjust your filters or check back when new opportunities are loaded.' />
        ) : (
          <>
            <div className='bg-gray-900 border border-gray-800 rounded-lg overflow-hidden'>
              <table className='w-full text-sm'>
                <thead><tr className='border-b border-gray-800 text-left'>
                  {['Title / Agency','Level','State','Value','Win Prob','Deadline','Source'].map((h) => (
                    <th key={h} className='px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider'>{h}</th>
                  ))}
                </tr></thead>
                <tbody className='divide-y divide-gray-800'>
                  {opps.map((opp: any) => (
                    <tr key={opp.id} className='hover:bg-gray-800/30 transition-colors'>
                      <td className='px-4 py-3'>
                        <div className='font-medium text-white line-clamp-1'>{opp.title}</div>
                        <div className='text-xs text-gray-400 mt-0.5 flex items-center gap-1'>
                          <Building2 className='w-3 h-3' />{opp.agency}
                          {opp.jurisdiction && <span className='text-gray-600'> · {opp.jurisdiction}</span>}
                        </div>
                      </td>
                      <td className='px-4 py-3'>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${LEVEL_COLORS[opp.contractLevel] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {LEVEL_LABELS[opp.contractLevel] || opp.contractLevel}
                        </span>
                      </td>
                      <td className='px-4 py-3'>
                        <div className='flex items-center gap-1 text-gray-300'><MapPin className='w-3 h-3 text-gray-500' />{opp.state}</div>
                      </td>
                      <td className='px-4 py-3 text-gray-300'>
                        {opp.estimatedValue ? formatCurrency(opp.estimatedValue) : <span className='text-gray-600'>TBD</span>}
                      </td>
                      <td className='px-4 py-3'>
                        {opp.isScored ? (
                          <div className='flex items-center gap-2'>
                            <div className='w-16 bg-gray-700 rounded-full h-1.5'>
                              <div className={`h-1.5 rounded-full ${opp.probabilityScore >= 0.6 ? 'bg-green-500' : opp.probabilityScore >= 0.35 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.round(opp.probabilityScore * 100)}%` }} />
                            </div>
                            <span className='text-xs text-gray-400'>{Math.round(opp.probabilityScore * 100)}%</span>
                          </div>) : <span className='text-xs text-gray-600'></span>}
                      </td>
                      <td className='px-4 py-3'>
                        
                        <div className='text-xs text-gray-500 mt-0.5'>{format(new Date(opp.responseDeadline), 'MMM d, yyyy')}</div>
                      </td>
                      <td className='px-4 py-3'>
                        {opp.sourceUrl ? (
                          <a href={opp.sourceUrl} target='_blank' rel='noopener noreferrer' className='inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300'>
                            <Globe className='w-3 h-3' />{opp.sourcePortal || 'View'}
                          </a>
                        ) : <span className='text-xs text-gray-600'>{opp.sourcePortal || ''}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.pages > 1 && (
              <div className='flex items-center justify-between mt-4'>
                <p className='text-sm text-gray-400'>Showing {((pagination.page - 1) * pagination.limit) + 1}{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}</p>
                <div className='flex gap-2'>
                  <button onClick={() => setFilters({ ...filters, page: filters.page - 1 })} disabled={filters.page <= 1} className='px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'>Previous</button>
                  <button onClick={() => setFilters({ ...filters, page: filters.page + 1 })} disabled={filters.page >= pagination.pages} className='px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'>Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default StateMunicipalPage
