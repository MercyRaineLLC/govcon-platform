import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { opportunitiesApi, jobsApi, clientsApi } from '../services/api';
import { useQuery as useClientQuery } from '@tanstack/react-query';
import {
  PageHeader, DeadlineBadge, ProbabilityBar, formatCurrency,
  Spinner, EmptyState, ErrorBanner
} from '../components/ui';
import {
  Search, Download, Filter, ChevronUp, ChevronDown,
  CheckCircle, AlertCircle, Loader, Sparkles, X, SlidersHorizontal
} from 'lucide-react';
import { format } from 'date-fns';

const SET_ASIDE_LABELS: Record<string, string> = {
  NONE: 'Open',
  SMALL_BUSINESS: 'SB',
  SDVOSB: 'SDVOSB',
  WOSB: 'WOSB',
  HUBZONE: 'HUBZone',
  SBA_8A: '8(a)',
  TOTAL_SMALL_BUSINESS: 'TSB',
};

type PipelineStatus = 'idle' | 'running' | 'success' | 'error';

interface JobState {
  jobId: string | null;
  status: PipelineStatus;
  message: string;
  detail: string;
}

const defaultJobState = (): JobState => ({
  jobId: null, status: 'idle', message: '', detail: '',
});

function StatusBanner({ state, label, onRefresh }: { state: JobState; label: string; onRefresh?: () => void }) {
  if (state.status === 'idle') return null;
  const configs = {
    running: { bg: 'bg-blue-900/30 border-blue-700', text: 'text-blue-300', icon: <Loader className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" /> },
    success: { bg: 'bg-green-900/30 border-green-700', text: 'text-green-300', icon: <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> },
    error:   { bg: 'bg-red-900/30 border-red-700',   text: 'text-red-300',   icon: <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> },
  };
  const c = configs[state.status as keyof typeof configs];
  if (!c) return null;
  return (
    <div className={`flex items-start gap-3 border ${c.bg} ${c.text} text-sm rounded px-4 py-3 mb-3`}>
      {c.icon}
      <div className="flex-1">
        <p className="font-medium">{label}: {state.message}</p>
        {state.detail && <p className="text-xs opacity-75 mt-0.5">{state.detail}</p>}
      </div>
      {onRefresh && state.status === 'running' && (
        <button onClick={onRefresh} className="text-xs underline opacity-75 hover:opacity-100 flex-shrink-0 mt-0.5">
          Refresh list now
        </button>
      )}
    </div>
  );
}

export function OpportunitiesPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({
    naicsCode: '', agency: '', setAsideType: '', daysUntilDeadline: '',
    probabilityMin: '', estimatedValueMin: '', estimatedValueMax: '',
    placeOfPerformance: '', recompeteOnly: '', enrichedOnly: '', showExpired: '',
    selectedClientId: '',
    sortBy: 'probability', sortOrder: 'desc', page: 1, limit: 25,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showIngestPanel, setShowIngestPanel] = useState(false);
  const [ingestNaics, setIngestNaics] = useState('');
  const [ingestLimit, setIngestLimit] = useState('25');
  const [ingestState, setIngestState] = useState<JobState>(defaultJobState());
  const [enrichState, setEnrichState] = useState<JobState>(defaultJobState());
  const ingestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enrichPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: clientsData } = useQuery({
    queryKey: ['clients-list-opp'],
    queryFn: () => clientsApi.list({ limit: 200 }),
  });
  const clients: any[] = clientsData?.data ?? [];

  // Firm info for last-ingested display
  const { data: firmData } = useQuery({
    queryKey: ['firm'],
    queryFn: () => import('../services/api').then(m => m.firmApi.get()),
    staleTime: 30000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['opportunities', filters],
    queryFn: () => opportunitiesApi.search({
      ...filters,
      daysUntilDeadline: filters.daysUntilDeadline || undefined,
      naicsCode: filters.naicsCode || undefined,
      agency: filters.agency || undefined,
      setAsideType: filters.setAsideType || undefined,
      placeOfPerformance: filters.placeOfPerformance || undefined,
      probabilityMin: filters.probabilityMin || undefined,
      estimatedValueMin: filters.estimatedValueMin || undefined,
      estimatedValueMax: filters.estimatedValueMax || undefined,
      recompeteOnly: filters.recompeteOnly || undefined,
      enrichedOnly: filters.enrichedOnly || undefined,
      showExpired: filters.showExpired || undefined,
      clientId: filters.selectedClientId || undefined,
    }),
  });

  // Reliable recursive poll — no overlapping requests, surfaces errors, caps at 5 min
  const pollJob = useCallback((
    jobId: string,
    setState: React.Dispatch<React.SetStateAction<JobState>>,
    pollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
    onComplete: (job: any) => void
  ) => {
    if (pollRef.current) clearTimeout(pollRef.current as any);
    let attempts = 0;
    const MAX_ATTEMPTS = 75; // 75 × 4s = 5 min max

    const tick = async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        setState((s) => ({ ...s, status: 'error', message: 'Timed out', detail: 'Job is taking too long. Refresh the page to check results.' }));
        pollRef.current = null;
        return;
      }
      try {
        const res = await jobsApi.getJob(jobId);
        const job = res.data ?? res; // handle both {data: job} and raw job
        const status: string = job?.status ?? '';

        if (status === 'COMPLETE') {
          pollRef.current = null;
          onComplete(job);
          // Force refetch — more reliable than just invalidate
          qc.invalidateQueries({ queryKey: ['opportunities'] });
          qc.refetchQueries({ queryKey: ['opportunities'] });
        } else if (status === 'FAILED') {
          pollRef.current = null;
          setState((s) => ({ ...s, status: 'error', message: 'Job failed', detail: job.errorDetail || 'Unknown error' }));
        } else {
          // Still running — schedule next tick
          pollRef.current = setTimeout(tick, 4000) as any;
        }
      } catch (err: any) {
        // Show the error but keep polling (transient network issue)
        const msg = err?.response?.data?.error || err?.message || 'Network error';
        setState((s) => ({ ...s, detail: `Poll error (attempt ${attempts}): ${msg}` }));
        if (attempts < MAX_ATTEMPTS) {
          pollRef.current = setTimeout(tick, 4000) as any;
        } else {
          setState((s) => ({ ...s, status: 'error', message: 'Poll failed', detail: msg }));
        }
      }
    };

    // Start first tick immediately (no initial delay) to catch fast jobs
    tick();
  }, [qc]);

  useEffect(() => {
    return () => {
      if (ingestPollRef.current) clearTimeout(ingestPollRef.current as any);
      if (enrichPollRef.current) clearTimeout(enrichPollRef.current as any);
    };
  }, []);

  const handleIngest = async () => {
    setShowIngestPanel(false);
    setIngestState({ jobId: null, status: 'running', message: 'Contacting SAM.gov...', detail: `NAICS: ${ingestNaics || 'all'} · Limit: ${ingestLimit}` });
    try {
      const res = await jobsApi.triggerIngest({
        naicsCode: ingestNaics.trim() || undefined,
        limit: parseInt(ingestLimit, 10) || 25,
      });
      // Backend may return 409 if job already running
      if (!res.data?.jobId && res.data?.status === 'RUNNING') {
        setIngestState({ jobId: res.data.jobId, status: 'running', message: res.data.message || 'Already running...', detail: '' });
        return;
      }
      const jobId = res.data.jobId;
      setIngestState((s) => ({ ...s, jobId, message: 'Ingesting from SAM.gov...', detail: `NAICS: ${ingestNaics || 'all'} · Limit: ${ingestLimit}` }));
      pollJob(jobId, setIngestState, ingestPollRef, (job) => {
        setIngestState({ jobId, status: 'success', message: 'Ingest complete', detail: `${job.opportunitiesNew || 0} new · ${job.scoringJobsQueued || 0} scoring queued · ${job.errors || 0} errors` });
        setTimeout(() => setIngestState(defaultJobState()), 15000);
      });
    } catch (err: any) {
      // Surface the actual error — 429, 401, etc.
      const detail = err?.response?.data?.error || err?.message || 'SAM.gov unavailable';
      setIngestState({ jobId: null, status: 'error', message: 'Ingest failed', detail });
    }
  };

  const handleEnrich = async () => {
    setEnrichState({ jobId: null, status: 'running', message: 'Querying USAspending...', detail: '' });
    try {
      const res = await jobsApi.triggerEnrich();
      const jobId = res.data.jobId;
      if (!jobId) {
        setEnrichState({ jobId: null, status: 'success', message: res.data.message || 'All enriched', detail: '' });
        setTimeout(() => setEnrichState(defaultJobState()), 8000);
        return;
      }
      const toEnrich = res.data.opportunitiesToEnrich || 0;
      setEnrichState((s) => ({ ...s, jobId, message: `Enriching ${toEnrich.toLocaleString()} opportunities...`, detail: 'Pulling historical award data from USAspending' }));
      pollJob(jobId, setEnrichState, enrichPollRef, (job) => {
        setEnrichState({ jobId, status: 'success', message: 'Enrichment complete', detail: `${job.enrichedCount || 0} opportunities enriched with award history` });
        setTimeout(() => setEnrichState(defaultJobState()), 12000);
      });
    } catch (err: any) {
      setEnrichState({ jobId: null, status: 'error', message: 'Enrichment failed', detail: err?.response?.data?.error || 'USAspending API unavailable' });
    }
  };

  const toggleSortOrder = () => setFilters((f) => ({ ...f, sortOrder: f.sortOrder === 'desc' ? 'asc' : 'desc', page: 1 }));
  const update = (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value, page: 1 }));

  const forceRefresh = () => {
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    qc.refetchQueries({ queryKey: ['opportunities'] });
  };

  const opps = data?.data || [];
  const meta = data?.meta;

  const lastIngested: string | null = firmData?.data?.lastIngestedAt ?? firmData?.lastIngestedAt ?? null;

  return (
    <div>
      <PageHeader title="Federal Opportunities" subtitle="SAM.gov intelligence pipeline">
        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={forceRefresh} className="btn-secondary flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={handleEnrich}
            disabled={enrichState.status === 'running'}
            className="btn-secondary flex items-center gap-2"
          >
            {enrichState.status === 'running' ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {enrichState.status === 'running' ? 'Enriching...' : 'Enrich Awards'}
          </button>
          <button
            onClick={() => setShowIngestPanel((v) => !v)}
            disabled={ingestState.status === 'running'}
            className="btn-primary flex items-center gap-2"
          >
            {ingestState.status === 'running' ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {ingestState.status === 'running' ? 'Ingesting...' : 'Ingest SAM.gov'}
          </button>
        </div>
      </PageHeader>

      {/* Ingest configuration panel */}
      {showIngestPanel && ingestState.status !== 'running' && (
        <div className="card mb-4 border-blue-800/50">
          <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" /> SAM.gov Ingest Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">NAICS Code <span className="text-gray-600">(optional)</span></label>
              <input
                className="input font-mono"
                placeholder="e.g. 541611 — leave blank for all"
                value={ingestNaics}
                onChange={(e) => setIngestNaics(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Max records to fetch</label>
              <select className="input" value={ingestLimit} onChange={(e) => setIngestLimit(e.target.value)}>
                <option value="10">10 — quick test</option>
                <option value="25">25 — default</option>
                <option value="50">50</option>
                <option value="100">100 — slow, may hit rate limit</option>
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <p className="text-xs text-gray-600 mb-2">
                SAM.gov limits: ~10 req/sec, ~1,000/day.
                {lastIngested && ` Last ingest: ${new Date(lastIngested).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`}
              </p>
              <button onClick={handleIngest} className="btn-primary flex items-center gap-2 w-full justify-center">
                <Download className="w-4 h-4" /> Start Ingest
              </button>
            </div>
          </div>
          <p className="text-xs text-yellow-500/80">
            If you hit a 429 rate limit error, wait 15–60 minutes before trying again. SAM.gov enforces daily quotas on public API keys.
          </p>
        </div>
      )}

      <StatusBanner state={ingestState} label="Ingest" onRefresh={forceRefresh} />
      <StatusBanner state={enrichState} label="Enrichment" onRefresh={forceRefresh} />

      {/* Last ingested indicator */}
      {lastIngested && ingestState.status === 'idle' && enrichState.status === 'idle' && (
        <p className="text-xs text-gray-600 mb-3 flex items-center gap-1.5">
          <CheckCircle className="w-3 h-3 text-gray-700" />
          Last SAM.gov ingest: {new Date(lastIngested).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Filter className="w-4 h-4" /><span>Filters</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowAdvanced((a: boolean) => !a)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />{showAdvanced ? 'Fewer filters' : 'More filters'}
            </button>
            <button onClick={() => setFilters((f: any) => ({ ...f, naicsCode:'', agency:'', setAsideType:'', daysUntilDeadline:'', probabilityMin:'', estimatedValueMin:'', estimatedValueMax:'', placeOfPerformance:'', recompeteOnly:'', enrichedOnly:'', showExpired:'', selectedClientId:'', page:1 }))} className="text-xs text-gray-600 hover:text-red-400 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>

        {/* Row 1 — core filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <div className="relative col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input pl-9" placeholder="Agency name..." value={filters.agency} onChange={(e) => update('agency', e.target.value)} />
          </div>
          <input className="input" placeholder="NAICS code" value={filters.naicsCode} onChange={(e) => update('naicsCode', e.target.value)} />
          <select className="input" value={filters.setAsideType} onChange={(e) => update('setAsideType', e.target.value)}>
            <option value="">All set-asides</option>
            {Object.entries(SET_ASIDE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" value={filters.selectedClientId} onChange={(e) => update('selectedClientId', e.target.value)}>
            <option value="">Filter by client fit</option>
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="input flex-1" value={filters.sortBy} onChange={(e) => update('sortBy', e.target.value)}>
              <option value="probability">Win Probability</option>
              <option value="deadline">Deadline</option>
              <option value="expectedValue">Exp. Value</option>
              <option value="estimatedValue">Est. Value</option>
              <option value="createdAt">Date Added</option>
            </select>
            <button onClick={toggleSortOrder} className="btn-secondary px-2 flex-shrink-0" title={filters.sortOrder === 'desc' ? 'High first' : 'Low first'}>
              {filters.sortOrder === 'desc' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Row 2 — advanced */}
        {showAdvanced && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-gray-800">
            <input className="input" type="number" placeholder="Max days to deadline" value={filters.daysUntilDeadline} onChange={(e) => update('daysUntilDeadline', e.target.value)} />
            <input className="input" type="number" min="0" max="100" placeholder="Min win % (e.g. 60)" value={filters.probabilityMin ? String(Math.round(Number(filters.probabilityMin)*100)) : ''} onChange={(e) => update('probabilityMin', e.target.value ? String(Number(e.target.value)/100) : '')} />
            <input className="input" type="number" placeholder="Min value $" value={filters.estimatedValueMin} onChange={(e) => update('estimatedValueMin', e.target.value)} />
            <input className="input" type="number" placeholder="Max value $" value={filters.estimatedValueMax} onChange={(e) => update('estimatedValueMax', e.target.value)} />
            <input className="input" placeholder="State or city" value={filters.placeOfPerformance} onChange={(e) => update('placeOfPerformance', e.target.value)} />
            <div className="flex flex-col gap-1.5 justify-center">
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input type="checkbox" checked={filters.recompeteOnly === 'true'} onChange={(e) => update('recompeteOnly', e.target.checked ? 'true' : '')} className="w-3.5 h-3.5 rounded" />
                Recompete only
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input type="checkbox" checked={filters.enrichedOnly === 'true'} onChange={(e) => update('enrichedOnly', e.target.checked ? 'true' : '')} className="w-3.5 h-3.5 rounded" />
                Enriched only
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                <input type="checkbox" checked={filters.showExpired === 'true'} onChange={(e) => update('showExpired', e.target.checked ? 'true' : '')} className="w-3.5 h-3.5 rounded" />
                Show expired
              </label>
            </div>
          </div>
        )}
      </div>

      {isLoading && <div className="flex justify-center mt-10"><Spinner size="lg" /></div>}
      {error && <ErrorBanner message="Failed to load opportunities" />}
      {!isLoading && opps.length === 0 && <EmptyState message="No opportunities found. Try adjusting filters or run an ingestion." />}

      {opps.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">{meta?.total?.toLocaleString()} opportunities found</p>
            <div className="flex gap-1 text-xs">
              {[
                { key: 'probability', label: 'Win %' },
                { key: 'deadline', label: 'Deadline' },
                { key: 'expectedValue', label: 'Exp. Value' },
                { key: 'estimatedValue', label: 'Est. Value' },
              ].map(col => (
                <button
                  key={col.key}
                  onClick={() => {
                    if (filters.sortBy === col.key) {
                      update('sortOrder', filters.sortOrder === 'desc' ? 'asc' : 'desc');
                    } else {
                      setFilters((f: any) => ({ ...f, sortBy: col.key, sortOrder: 'desc', page: 1 }));
                    }
                  }}
                  className={`px-2 py-1 rounded flex items-center gap-0.5 transition-colors ${filters.sortBy === col.key ? 'bg-blue-900/40 text-blue-300' : 'text-gray-600 hover:text-gray-400'}`}
                >
                  {col.label}
                  {filters.sortBy === col.key && (filters.sortOrder === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {opps.map((opp: any) => {
              const isExpired = (opp.deadline?.daysUntilDeadline ?? 1) <= 0;
              return (
                <Link key={opp.id} to={`/opportunities/${opp.id}`} className={`card flex items-center gap-4 transition-colors cursor-pointer ${isExpired ? 'opacity-50 border-red-900/50 hover:border-red-800' : 'hover:border-gray-600'}`}>
                  <div className="flex-shrink-0 w-24">
                    <DeadlineBadge priority={opp.deadline?.priority || 'GREEN'} label={opp.deadline?.label || ''} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isExpired ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{opp.title}</p>
                      {isExpired && <span className="flex-shrink-0 text-xs bg-red-900/40 text-red-400 border border-red-800 px-1.5 py-0.5 rounded">EXPIRED</span>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {opp.agency} · NAICS {opp.naicsCode} · {SET_ASIDE_LABELS[opp.setAsideType] || opp.setAsideType}
                      {opp.isEnriched && <span className="ml-2 text-blue-400">· enriched</span>}
                      {opp.recompeteFlag && <span className="ml-2 text-yellow-400">· recompete</span>}
                    </p>
                  </div>
                  <div className="w-32 flex-shrink-0">
                    <p className="text-xs text-gray-500 mb-1">Win Probability</p>
                    <ProbabilityBar probability={opp.probabilityScore || 0} />
                  </div>
                  <div className="text-right flex-shrink-0 w-28">
                    <p className="text-sm font-mono text-gray-200">{formatCurrency(opp.estimatedValue)}</p>
                    <p className="text-xs text-green-400">EV: {formatCurrency(opp.expectedValue)}</p>
                  </div>
                  <div className="text-right flex-shrink-0 w-20">
                    <p className="text-xs text-gray-500">Deadline</p>
                    <p className={`text-xs ${isExpired ? 'text-red-500' : 'text-gray-300'}`}>{opp.responseDeadline ? format(new Date(opp.responseDeadline), 'MMM d') : 'N/A'}</p>
                  </div>
                </Link>
              );
            })}
          </div>
          {meta && meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button className="btn-secondary text-sm" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Previous</button>
              <span className="text-sm text-gray-400 py-2">Page {meta.page} of {meta.totalPages}</span>
              <button className="btn-secondary text-sm" disabled={filters.page >= meta.totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}