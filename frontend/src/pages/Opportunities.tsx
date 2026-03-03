import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { opportunitiesApi, jobsApi } from '../services/api';
import {
  PageHeader, DeadlineBadge, ProbabilityBar, formatCurrency,
  Spinner, EmptyState, ErrorBanner
} from '../components/ui';
import {
  Search, Download, Filter, ArrowUpDown,
  CheckCircle, AlertCircle, Loader, Sparkles
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

function StatusBanner({ state, label }: { state: JobState; label: string }) {
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
      <div>
        <p className="font-medium">{label}: {state.message}</p>
        {state.detail && <p className="text-xs opacity-75 mt-0.5">{state.detail}</p>}
      </div>
    </div>
  );
}

export function OpportunitiesPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({
    naicsCode: '', agency: '', setAsideType: '', daysUntilDeadline: '',
    sortBy: 'probability', sortOrder: 'desc', page: 1, limit: 25,
  });
  const [ingestState, setIngestState] = useState<JobState>(defaultJobState());
  const [enrichState, setEnrichState] = useState<JobState>(defaultJobState());
  const ingestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enrichPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['opportunities', filters],
    queryFn: () => opportunitiesApi.search({
      ...filters,
      daysUntilDeadline: filters.daysUntilDeadline || undefined,
      naicsCode: filters.naicsCode || undefined,
      agency: filters.agency || undefined,
      setAsideType: filters.setAsideType || undefined,
    }),
  });

  const pollJob = useCallback((
    jobId: string,
    setState: React.Dispatch<React.SetStateAction<JobState>>,
    pollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
    onComplete: (job: any) => void
  ) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await jobsApi.getJob(jobId);
        const job = res.data;
        if (job.status === 'COMPLETE') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          onComplete(job);
          qc.invalidateQueries({ queryKey: ['opportunities'] });
        } else if (job.status === 'FAILED') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setState((s) => ({ ...s, status: 'error', message: 'Job failed', detail: job.errorDetail || 'Unknown error' }));
        }
      } catch { /* non-fatal */ }
    }, 4000);
  }, [qc]);

  useEffect(() => {
    return () => {
      if (ingestPollRef.current) clearInterval(ingestPollRef.current);
      if (enrichPollRef.current) clearInterval(enrichPollRef.current);
    };
  }, []);

  const handleIngest = async () => {
    setIngestState({ jobId: null, status: 'running', message: 'Contacting SAM.gov...', detail: '' });
    try {
      const res = await jobsApi.triggerIngest({ naicsCode: filters.naicsCode || undefined, limit: 25 });
      const jobId = res.data.jobId;
      setIngestState((s) => ({ ...s, jobId, message: 'Ingesting opportunities...' }));
      pollJob(jobId, setIngestState, ingestPollRef, (job) => {
        setIngestState({ jobId, status: 'success', message: 'Ingest complete', detail: `${job.opportunitiesNew || 0} new · ${job.scoringJobsQueued || 0} scoring queued · ${job.errors || 0} errors` });
        setTimeout(() => setIngestState(defaultJobState()), 12000);
      });
    } catch (err: any) {
      setIngestState({ jobId: null, status: 'error', message: 'Ingest failed', detail: err?.response?.data?.error || 'SAM.gov unavailable' });
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

  const opps = data?.data || [];
  const meta = data?.meta;

  return (
    <div>
      <PageHeader title="Federal Opportunities" subtitle="SAM.gov intelligence pipeline">
        <div className="flex gap-2">
          <button onClick={handleIngest} disabled={ingestState.status === 'running'} className="btn-primary flex items-center gap-2">
            {ingestState.status === 'running' ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {ingestState.status === 'running' ? 'Ingesting...' : 'Ingest SAM.gov'}
          </button>
          <button onClick={handleEnrich} disabled={enrichState.status === 'running'} className="btn-secondary flex items-center gap-2">
            {enrichState.status === 'running' ? <Loader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {enrichState.status === 'running' ? 'Enriching...' : 'Enrich with Award Data'}
          </button>
        </div>
      </PageHeader>

      <StatusBanner state={ingestState} label="Ingest" />
      <StatusBanner state={enrichState} label="Enrichment" />

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-3 text-sm text-gray-400">
          <Filter className="w-4 h-4" /><span>Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="relative col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input pl-9" placeholder="Agency name..." value={filters.agency} onChange={(e) => update('agency', e.target.value)} />
          </div>
          <input className="input" placeholder="NAICS code" value={filters.naicsCode} onChange={(e) => update('naicsCode', e.target.value)} />
          <select className="input" value={filters.setAsideType} onChange={(e) => update('setAsideType', e.target.value)}>
            <option value="">All set-asides</option>
            {Object.entries(SET_ASIDE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input" type="number" placeholder="Max days" value={filters.daysUntilDeadline} onChange={(e) => update('daysUntilDeadline', e.target.value)} />
          <div className="flex gap-2">
            <select className="input flex-1" value={filters.sortBy} onChange={(e) => update('sortBy', e.target.value)}>
              <option value="probability">Sort: Probability</option>
              <option value="deadline">Sort: Deadline</option>
              <option value="expectedValue">Sort: Exp. Value</option>
              <option value="createdAt">Sort: Newest</option>
            </select>
            <button onClick={toggleSortOrder} className="btn-secondary px-2 flex-shrink-0" title={filters.sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}>
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {isLoading && <div className="flex justify-center mt-10"><Spinner size="lg" /></div>}
      {error && <ErrorBanner message="Failed to load opportunities" />}
      {!isLoading && opps.length === 0 && <EmptyState message="No opportunities found. Try adjusting filters or run an ingestion." />}

      {opps.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">{meta?.total?.toLocaleString()} opportunities found</p>
            <p className="text-xs text-gray-600">{filters.sortOrder === 'desc' ? '↓ Highest first' : '↑ Lowest first'}</p>
          </div>
          <div className="space-y-2">
            {opps.map((opp: any) => (
              <Link key={opp.id} to={`/opportunities/${opp.id}`} className="card flex items-center gap-4 hover:border-gray-600 transition-colors cursor-pointer">
                <div className="flex-shrink-0 w-24">
                  <DeadlineBadge priority={opp.deadline?.priority || 'GREEN'} label={opp.deadline?.label || ''} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{opp.title}</p>
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
                  <p className="text-xs text-gray-300">{opp.responseDeadline ? format(new Date(opp.responseDeadline), 'MMM d') : 'N/A'}</p>
                </div>
              </Link>
            ))}
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