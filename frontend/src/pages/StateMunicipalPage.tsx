import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { MapPin, RefreshCw, Lock, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { stateMunicipalApi } from '../services/api'
import { useTier } from '../hooks/useTier'
import { PageHeader, Spinner } from '../components/ui'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

const LEVEL_COLORS: Record<string, string> = {
  STATE:     'bg-blue-900/60 text-blue-300 border border-blue-700',
  MUNICIPAL: 'bg-green-900/60 text-green-300 border border-green-700',
  COUNTY:    'bg-purple-900/60 text-purple-300 border border-purple-700',
  FEDERAL:   'bg-gray-800 text-gray-300 border border-gray-600',
}

function ProbBar({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-gray-600">—</span>
  const pct = Math.round(score * 100)
  const color = pct >= 65 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400">{pct}%</span>
    </div>
  )
}

export function StateMunicipalPage() {
  const { hasAddon } = useTier()
  const [state, setState] = useState('')
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', agency: '', state: '', contractLevel: 'STATE', estimatedValue: '', responseDeadline: '', description: '', solicitationNumber: '', contactEmail: '', sourceUrl: '' })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['state-municipal', state, level, search],
    queryFn: () => stateMunicipalApi.list({ state: state || undefined, level: level || undefined, search: search || undefined, limit: 100 }),
    enabled: hasAddon('state_municipal'),
  })

  const syncMutation = useMutation({
    mutationFn: () => stateMunicipalApi.sync(),
    onSuccess: () => {
      setSyncMsg('Sync started — pulling from open data sources. Refresh in ~30 seconds.')
      setTimeout(() => setSyncMsg(''), 8000)
    },
  })

  const addMutation = useMutation({
    mutationFn: () => stateMunicipalApi.create(form),
    onSuccess: () => { setShowAdd(false); refetch(); setForm({ title: '', agency: '', state: '', contractLevel: 'STATE', estimatedValue: '', responseDeadline: '', description: '', solicitationNumber: '', contactEmail: '', sourceUrl: '' }) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => stateMunicipalApi.delete(id),
    onSuccess: () => refetch(),
  })

  if (!hasAddon('state_municipal')) {
    return (
      <div>
        <PageHeader title="State & Municipal Pipeline" subtitle="State, county, and municipal government contracts" />
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center">
            <Lock className="w-8 h-8 text-gray-500" />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold text-gray-200 mb-2">State & Municipal Pipeline</h2>
            <p className="text-gray-400 mb-4">
              Access state, county, and municipal government contract opportunities across all 50 states.
              Expand beyond federal contracting with thousands of additional opportunities.
            </p>
            <div className="text-sm text-amber-400 font-medium mb-6">Add-On: $99/mo</div>
            <a href="/billing" className="btn-primary">Upgrade — Add State & Municipal</a>
          </div>
        </div>
      </div>
    )
  }

  const opps: any[] = data?.data?.opportunities ?? []
  const total: number = data?.data?.total ?? 0

  return (
    <div>
      <PageHeader
        title="State & Municipal Pipeline"
        subtitle={`${total} opportunities across state, county, and municipal agencies`}
      />

      {/* Actions bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="input flex-1 min-w-48"
          placeholder="Search opportunities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-32" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All States</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input w-36" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All Levels</option>
          <option value="STATE">State</option>
          <option value="MUNICIPAL">Municipal</option>
          <option value="COUNTY">County</option>
          <option value="FEDERAL">Federal</option>
        </select>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </button>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          Sync
        </button>
      </div>

      {syncMsg && <p className="text-sm text-green-400 mb-3">{syncMsg}</p>}

      {/* Add form */}
      {showAdd && (
        <div className="card mb-4">
          <h3 className="font-semibold text-gray-200 mb-3">Add Opportunity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div><label className="label">Title *</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><label className="label">Agency *</label><input className="input" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} /></div>
            <div><label className="label">State *</label>
              <select className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                <option value="">Select...</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label">Level</label>
              <select className="input" value={form.contractLevel} onChange={(e) => setForm({ ...form, contractLevel: e.target.value })}>
                <option value="STATE">State</option>
                <option value="MUNICIPAL">Municipal</option>
                <option value="COUNTY">County</option>
              </select>
            </div>
            <div><label className="label">Est. Value ($)</label><input type="number" className="input" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} /></div>
            <div><label className="label">Deadline</label><input type="date" className="input" value={form.responseDeadline} onChange={(e) => setForm({ ...form, responseDeadline: e.target.value })} /></div>
            <div><label className="label">Solicitation #</label><input className="input" value={form.solicitationNumber} onChange={(e) => setForm({ ...form, solicitationNumber: e.target.value })} /></div>
            <div><label className="label">Contact Email</label><input className="input" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></div>
            <div className="md:col-span-2"><label className="label">Source URL</label><input className="input" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></div>
            <div className="md:col-span-2"><label className="label">Description</label><textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => addMutation.mutate()} disabled={!form.title || !form.agency || !form.state || addMutation.isPending} className="btn-primary disabled:opacity-50">
              {addMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : opps.length === 0 ? (
        <div className="card text-center py-12">
          <MapPin className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No state or municipal opportunities found.</p>
          <p className="text-sm text-gray-600 mt-1">Click <strong>Sync</strong> to pull from open data sources, or <strong>Add</strong> to enter one manually.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Title</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Agency / State</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Level</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Est. Value</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Deadline</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Win Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {opps.map((opp: any) => (
                <tr key={opp.id} className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-gray-200 font-medium line-clamp-1">{opp.title}</p>
                    {opp.solicitationNumber && <p className="text-xs text-gray-600 mt-0.5">{opp.solicitationNumber}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-300">{opp.agency}</p>
                    <span className="text-xs text-blue-400">{opp.state}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[opp.contractLevel] || LEVEL_COLORS.FEDERAL}`}>
                      {opp.contractLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {opp.estimatedValue != null ? `$${Number(opp.estimatedValue).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {opp.responseDeadline ? new Date(opp.responseDeadline).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ProbBar score={opp.probabilityScore} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {opp.sourceUrl && (
                        <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button onClick={() => { if (window.confirm('Delete this opportunity?')) deleteMutation.mutate(opp.id) }} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
