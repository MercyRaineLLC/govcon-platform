import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Loader, BarChart3, Play, AlertCircle, CheckCircle2, FileText } from 'lucide-react'

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'https://mrgovcon.co'

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
})

interface RunRow {
  id: string
  status: 'RUNNING' | 'COMPLETE' | 'FAILED'
  sampleSize: number
  yearsBack: number
  startedAt: string
  completedAt: string | null
  predictionCount: number | null
  brierScore: number | null
  meanProbability: number | null
  errorMessage: string | null
}

interface CalibrationBin {
  binMin: number
  binMax: number
  count: number
  meanPred: number
  observedRate: number
}

export default function AdminBacktestPage() {
  const qc = useQueryClient()
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [sampleSize, setSampleSize] = useState(1000)
  const [yearsBack, setYearsBack] = useState(5)

  const runsQuery = useQuery<{ data: RunRow[] }>({
    queryKey: ['backtest-runs'],
    queryFn: () =>
      axios.get(`${API_BASE}/api/admin/backtest/runs`, { headers: authHeader() }).then((r) => r.data),
    refetchInterval: 30_000,
  })

  const detailQuery = useQuery<any>({
    queryKey: ['backtest-run', selectedRunId],
    queryFn: () =>
      axios
        .get(`${API_BASE}/api/admin/backtest/runs/${selectedRunId}`, { headers: authHeader() })
        .then((r) => r.data),
    enabled: !!selectedRunId,
  })

  const startMut = useMutation({
    mutationFn: () =>
      axios
        .post(
          `${API_BASE}/api/admin/backtest/run`,
          { sampleSize, yearsBack },
          { headers: authHeader(), timeout: 30 * 60 * 1000 },
        )
        .then((r) => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['backtest-runs'] })
      if (res?.data?.runId) setSelectedRunId(res.data.runId)
    },
  })

  const runs = runsQuery.data?.data ?? []
  const detail = detailQuery.data?.data
  const run: RunRow | undefined = detail?.run
  const bins: CalibrationBin[] = (run?.calibrationBins as any) ?? []
  const factorMeans: Record<string, number> = (run as any)?.factorMeans ?? {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Probability Engine Backtest
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Score historical federal contract winners with the production probability
            engine. Calibrates how well predicted win probabilities match observed
            outcomes. Read-only — does not change scoring weights.
          </p>
        </div>
      </div>

      {/* Run controls */}
      <div className="rounded-xl p-5 space-y-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">Sample size</label>
            <input
              type="number"
              min={50}
              max={2000}
              value={sampleSize}
              onChange={(e) => setSampleSize(parseInt(e.target.value) || 1000)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 w-28"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide mb-1">Years back</label>
            <input
              type="number"
              min={1}
              max={10}
              value={yearsBack}
              onChange={(e) => setYearsBack(parseInt(e.target.value) || 5)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 w-20"
            />
          </div>
          <button
            onClick={() => startMut.mutate()}
            disabled={startMut.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.4)', color: '#fbbf24' }}
          >
            {startMut.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {startMut.isPending ? 'Running… (5–15 min)' : 'Run new backtest'}
          </button>
        </div>
        {startMut.isError && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {(startMut.error as any)?.response?.data?.error ?? 'Run failed'}
          </p>
        )}
        <p className="text-[11px] text-slate-600">
          The run is synchronous and will hold this page for several minutes. USAspending API
          is rate-limited; large samples take longer. Calibration metrics appear in the run
          detail panel below once the run completes.
        </p>
      </div>

      {/* Runs table */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="px-5 py-3 border-b border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Recent runs</h2>
        </div>
        {runsQuery.isLoading ? (
          <div className="p-8 text-center text-slate-600 text-sm">Loading runs...</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-slate-600 text-sm">No backtest runs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['Started', 'Status', 'Sample', 'Years', 'Predictions', 'Brier', 'Mean prob', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}
                  className={`border-t border-slate-800 hover:bg-white/[0.02] cursor-pointer ${selectedRunId === r.id ? 'bg-amber-900/10' : ''}`}
                  onClick={() => setSelectedRunId(r.id)}>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {r.status === 'COMPLETE' ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">COMPLETE</span>
                    ) : r.status === 'RUNNING' ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">RUNNING</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">FAILED</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{r.sampleSize}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{r.yearsBack}y</td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{r.predictionCount ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{r.brierScore != null ? r.brierScore.toFixed(4) : '—'}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{r.meanProbability != null ? (r.meanProbability * 100).toFixed(1) + '%' : '—'}</td>
                  <td className="px-4 py-3 text-[11px] text-amber-400">View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selectedRunId && run && run.status === 'COMPLETE' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat label="Brier score" value={run.brierScore != null ? run.brierScore.toFixed(4) : '—'} hint="Lower is better. 0 = perfect, 0.25 = random" />
            <Stat label="Mean predicted probability" value={run.meanProbability != null ? (run.meanProbability * 100).toFixed(1) + '%' : '—'} hint="Across all winners in the sample" />
            <Stat label="Sample size" value={String(run.predictionCount ?? '—')} hint={`${run.yearsBack} years of data`} />
          </div>

          {/* Calibration plot — bar chart of predicted bins */}
          {bins.length > 0 && (
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-3">Predicted-probability distribution</h3>
              <p className="text-[11px] text-slate-500 mb-4">
                Count of winners by predicted-probability bin. Healthy calibration concentrates winners
                in higher bins; mass in low bins means the engine systematically underestimates winners.
              </p>
              <div className="space-y-1.5">
                {bins.map((b, i) => {
                  const total = bins.reduce((a, x) => a + x.count, 0) || 1
                  const pct = (b.count / total) * 100
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="w-20 text-slate-500 font-mono">
                        {(b.binMin * 100).toFixed(0)}–{(b.binMax * 100).toFixed(0)}%
                      </span>
                      <div className="flex-1 bg-slate-800 rounded h-5 relative overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }}
                        />
                        <span className="absolute left-2 top-0.5 text-[11px] text-slate-200 font-mono">
                          {b.count}
                        </span>
                      </div>
                      <span className="w-14 text-slate-500 font-mono text-right">{pct.toFixed(1)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Per-factor mean values */}
          {Object.keys(factorMeans).length > 0 && (
            <div className="rounded-xl p-5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-3">Mean factor values across winners</h3>
              <p className="text-[11px] text-slate-500 mb-4">
                For each of the 8 factors, the average value across all sampled winners. Factors clustered near 0.5 are essentially noise; factors that diverge from 0.5 carry signal.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(factorMeans).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3 text-xs">
                    <span className="w-48 text-slate-400">{key}</span>
                    <div className="flex-1 bg-slate-800 rounded h-4 relative overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${value * 100}%`, background: '#3b82f6' }} />
                    </div>
                    <span className="w-12 text-slate-500 font-mono text-right">{(value * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top mispredictions */}
          {detail?.mispredictions?.length > 0 && (
            <div className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Top 20 mispredictions (winners we'd have told a firm not to bid)
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Lowest predicted probabilities among confirmed winners — these are the most informative
                  cases to understand what features the engine is missing.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {['Predicted', 'Agency', 'NAICS', 'Award', 'Recipient'].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.mispredictions.map((m: any, i: number) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="px-4 py-2 font-mono text-xs text-red-400">{(m.predictedProbability * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2 text-slate-400 text-xs truncate max-w-xs">{m.agency}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{m.naicsCode}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-300">${Math.round(m.awardAmount).toLocaleString()}</td>
                      <td className="px-4 py-2 text-slate-400 text-xs truncate max-w-sm">{m.recipientName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedRunId && run?.status === 'FAILED' && (
        <div className="rounded-xl p-5 text-sm text-red-300"
          style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)' }}>
          <p className="font-semibold mb-1">Run failed</p>
          <p className="text-[11px] text-red-400/80">{run.errorMessage ?? 'Unknown error'}</p>
        </div>
      )}

      {selectedRunId && run?.status === 'RUNNING' && (
        <div className="rounded-xl p-5 text-sm text-blue-300 flex items-center gap-3"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)' }}>
          <Loader className="w-4 h-4 animate-spin" />
          Run in progress. Refreshes every 30s.
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-100 mt-1 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-amber-400" /> {value}
      </p>
      {hint && <p className="text-[11px] text-slate-600 mt-1">{hint}</p>}
    </div>
  )
}
