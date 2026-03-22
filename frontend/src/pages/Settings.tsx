import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { firmApi, clientDocumentsApi } from '../services/api';
import { PageHeader, Spinner } from '../components/ui';
import { Settings, Users, Key, Eye, EyeOff, CheckCircle, XCircle, BookOpen, Brain, RefreshCw, BarChart2, Zap } from 'lucide-react';

const SYNC_LIMIT_KEY = 'govcon_sync_limit';
const SYNC_NAICS_KEY = 'govcon_sync_naics';

export function SettingsPage() {
  const qc = useQueryClient();
  const [penaltyForm, setPenaltyForm] = useState({ flatLateFee: '', penaltyPercent: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [samKey, setSamKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [revealSamKey, setRevealSamKey] = useState(false);
  const [samKeyMsg, setSamKeyMsg] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [revealAnthropicKey, setRevealAnthropicKey] = useState(false);
  const [anthropicKeyMsg, setAnthropicKeyMsg] = useState('');
  // AI provider settings
  const [llmProvider, setLlmProvider] = useState('claude');
  const [providerMsg, setProviderMsg] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [revealOpenaiKey, setRevealOpenaiKey] = useState(false);
  const [openaiKeyMsg, setOpenaiKeyMsg] = useState('');
  const [insightKey, setInsightKey] = useState('');
  const [showInsightKey, setShowInsightKey] = useState(false);
  const [revealInsightKey, setRevealInsightKey] = useState(false);
  const [insightKeyMsg, setInsightKeyMsg] = useState('');
  const [localaiBaseUrl, setLocalaiBaseUrl] = useState('');
  const [localaiModel, setLocalaiModel] = useState('');
  const [localaiMsg, setLocalaiMsg] = useState('');
  const [showUsage, setShowUsage] = useState(false);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [syncLimit, setSyncLimit] = useState(() => localStorage.getItem(SYNC_LIMIT_KEY) || '25');
  const [syncNaics, setSyncNaics] = useState(() => localStorage.getItem(SYNC_NAICS_KEY) || '');
  const [syncSaveMsg, setSyncSaveMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['firm'],
    queryFn: () => firmApi.get(),
  });

  const { data: usersData } = useQuery({
    queryKey: ['firm-users'],
    queryFn: () => firmApi.users(),
  });

  const { data: templatesData, refetch: refetchTemplates } = useQuery({
    queryKey: ['templates-admin'],
    queryFn: () => clientDocumentsApi.listTemplatesAdmin(),
  });

  const { data: usageData } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => firmApi.aiUsage({ days: 30 }),
    enabled: showUsage,
  });

  useEffect(() => {
    if (data?.data) {
      setPenaltyForm({
        flatLateFee: data.data.flatLateFee?.toString() || '',
        penaltyPercent: data.data.penaltyPercent ? (data.data.penaltyPercent * 100).toString() : '',
      });
      setLlmProvider(data.data.llmProvider || 'claude');
      setLocalaiBaseUrl(data.data.localaiBaseUrl || '');
      setLocalaiModel(data.data.localaiModel || '');
    }
  }, [data]);

  const penaltyMutation = useMutation({
    mutationFn: () => firmApi.updatePenaltyConfig({
      flatLateFee: penaltyForm.flatLateFee ? parseFloat(penaltyForm.flatLateFee) : null,
      penaltyPercent: penaltyForm.penaltyPercent ? parseFloat(penaltyForm.penaltyPercent) / 100 : null,
    }),
    onSuccess: () => {
      setSaveMsg('Penalty configuration saved.');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setSaveMsg(''), 3000);
    },
  });

  const samKeyMutation = useMutation({
    mutationFn: () => firmApi.updateSamApiKey(samKey),
    onSuccess: () => {
      setSamKeyMsg('SAM API key saved successfully.');
      setSamKey('');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setSamKeyMsg(''), 4000);
    },
    onError: (err: any) => setSamKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const anthropicKeyMutation = useMutation({
    mutationFn: () => firmApi.updateAnthropicApiKey(anthropicKey),
    onSuccess: () => {
      setAnthropicKeyMsg('Anthropic API key saved. AI analysis is now enabled.');
      setAnthropicKey('');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setAnthropicKeyMsg(''), 4000);
    },
    onError: (err: any) => setAnthropicKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const llmProviderMutation = useMutation({
    mutationFn: () => firmApi.updateLlmProvider(llmProvider),
    onSuccess: () => {
      setProviderMsg('AI provider updated.');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setProviderMsg(''), 3000);
    },
    onError: (err: any) => setProviderMsg(err?.response?.data?.error || 'Save failed'),
  });

  const openaiKeyMutation = useMutation({
    mutationFn: () => firmApi.updateOpenaiApiKey(openaiKey),
    onSuccess: () => {
      setOpenaiKeyMsg('OpenAI API key saved.');
      setOpenaiKey('');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setOpenaiKeyMsg(''), 4000);
    },
    onError: (err: any) => setOpenaiKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const insightKeyMutation = useMutation({
    mutationFn: () => firmApi.updateInsightEngineApiKey(insightKey),
    onSuccess: () => {
      setInsightKeyMsg('Insight Engine API key saved.');
      setInsightKey('');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setInsightKeyMsg(''), 4000);
    },
    onError: (err: any) => setInsightKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const localaiMutation = useMutation({
    mutationFn: () => firmApi.updateLocalaiConfig({ localaiBaseUrl, localaiModel }),
    onSuccess: () => {
      setLocalaiMsg('LocalAI configuration saved.');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setLocalaiMsg(''), 4000);
    },
    onError: (err: any) => setLocalaiMsg(err?.response?.data?.error || 'Save failed'),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      clientDocumentsApi.reviewTemplate(id, { status, reviewNotes: reviewNote[id] || undefined }),
    onSuccess: () => {
      refetchTemplates();
      qc.invalidateQueries({ queryKey: ['templates-admin'] });
    },
  });

  const firm = data?.data;
  const users = usersData?.data || [];
  const templates: any[] = templatesData?.data || [];
  const pendingTemplates = templates.filter((t) => t.status === 'PENDING');

  if (isLoading) return <div className="flex justify-center mt-10"><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Firm configuration and administration" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SAM API Key */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Key className="w-4 h-4 text-yellow-400" />
            <h2 className="font-semibold text-gray-200">SAM.gov API Key</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Your SAM.gov API key is required for the Ingest SAM.gov feature. Keys expire every 90 days —
            renew yours at <span className="text-blue-400">sam.gov → My Account → API Keys</span>.
            The stored key takes priority over the server environment variable.
          </p>

          {firm?.samApiKey && (
            <div className="mb-4 flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-700">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-xs text-gray-400 flex-1">Stored key:</span>
              <span className="font-mono text-xs text-gray-200 flex-1 truncate">
                {revealSamKey ? firm.samApiKey : `${firm.samApiKey.substring(0, 6)}${'•'.repeat(20)}${firm.samApiKey.slice(-4)}`}
              </span>
              <button
                type="button"
                onClick={() => setRevealSamKey((v) => !v)}
                className="text-gray-500 hover:text-gray-300 flex-shrink-0"
                title={revealSamKey ? 'Hide key' : 'Reveal key'}
              >
                {revealSamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">{firm?.samApiKey ? 'Replace SAM.gov API Key' : 'New SAM.gov API Key'}</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="input pr-10 font-mono text-sm"
                  placeholder="Paste your SAM.gov API key here..."
                  value={samKey}
                  onChange={(e) => setSamKey(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={() => samKeyMutation.mutate()}
              disabled={!samKey.trim() || samKeyMutation.isPending}
              className="btn-primary disabled:opacity-50"
            >
              {samKeyMutation.isPending ? 'Saving...' : 'Save Key'}
            </button>
          </div>
          {samKeyMsg && (
            <p className={`text-sm mt-2 ${samKeyMsg.includes('success') ? 'text-green-400' : 'text-red-400'}`}>
              {samKeyMsg}
            </p>
          )}
        </div>

        {/* AI Intelligence Provider */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <h2 className="font-semibold text-gray-200">AI Intelligence Provider</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Powers AI document analysis, compliance matrix generation, and bid strategy guidance.
            Choose your preferred provider and add the corresponding API key below.
            The active provider is used for all AI features across the platform.
          </p>

          {/* Provider Selector */}
          <div className="mb-5 p-4 rounded-lg bg-gray-800/40 border border-gray-700">
            <label className="label mb-2">Active AI Provider</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {[
                { value: 'claude', label: 'Claude (Anthropic)', desc: 'Premium — best for complex analysis', color: 'purple' },
                { value: 'openai', label: 'OpenAI (GPT-4o)', desc: 'Reliable — cost-effective option', color: 'green' },
                { value: 'insight_engine', label: 'Insight Engine', desc: 'Budget-friendly — great for high volume', color: 'amber' },
                { value: 'localai', label: 'LocalAI', desc: 'Free — runs entirely on your hardware', color: 'cyan' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLlmProvider(opt.value)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    llmProvider === opt.value
                      ? opt.color === 'purple' ? 'border-purple-500 bg-purple-900/20 text-purple-200'
                        : opt.color === 'green' ? 'border-green-500 bg-green-900/20 text-green-200'
                        : opt.color === 'amber' ? 'border-amber-500 bg-amber-900/20 text-amber-200'
                        : 'border-cyan-500 bg-cyan-900/20 text-cyan-200'
                      : 'border-gray-700 hover:border-gray-600 text-gray-400'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {llmProvider === opt.value && <Zap className="w-3.5 h-3.5" />}
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  <span className="text-[11px] opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => llmProviderMutation.mutate()}
                disabled={llmProviderMutation.isPending}
                className="btn-primary disabled:opacity-50 text-sm"
              >
                {llmProviderMutation.isPending ? 'Saving...' : 'Save Provider'}
              </button>
              {providerMsg && <p className={`text-sm ${providerMsg.includes('updated') ? 'text-green-400' : 'text-red-400'}`}>{providerMsg}</p>}
            </div>
          </div>

          {/* API Key Inputs — one per provider */}
          <div className="space-y-4">
            {/* Claude key */}
            <div className="border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${llmProvider === 'claude' ? 'bg-purple-400' : 'bg-gray-600'}`} />
                <span className="text-sm font-medium text-gray-300">Claude (Anthropic) Key</span>
                {llmProvider === 'claude' && <span className="text-[10px] bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded">Active</span>}
              </div>
              {firm?.anthropicApiKey && (
                <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded bg-gray-800/60 border border-gray-700">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  <span className="font-mono text-xs text-gray-200 flex-1 truncate">
                    {revealAnthropicKey ? firm.anthropicApiKey : `${firm.anthropicApiKey.substring(0, 10)}${'•'.repeat(16)}${firm.anthropicApiKey.slice(-4)}`}
                  </span>
                  <button type="button" onClick={() => setRevealAnthropicKey((v) => !v)} className="text-gray-500 hover:text-gray-300">
                    {revealAnthropicKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              <div className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <input type={showAnthropicKey ? 'text' : 'password'} className="input pr-10 font-mono text-sm"
                    placeholder="sk-ant-..." value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
                  <button type="button" onClick={() => setShowAnthropicKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={() => anthropicKeyMutation.mutate()} disabled={!anthropicKey.trim() || anthropicKeyMutation.isPending}
                  className="btn-primary disabled:opacity-50 text-sm">
                  {anthropicKeyMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
              {anthropicKeyMsg && <p className={`text-xs mt-1.5 ${anthropicKeyMsg.includes('saved') ? 'text-green-400' : 'text-red-400'}`}>{anthropicKeyMsg}</p>}
            </div>

            {/* OpenAI key */}
            <div className="border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${llmProvider === 'openai' ? 'bg-green-400' : 'bg-gray-600'}`} />
                <span className="text-sm font-medium text-gray-300">OpenAI (GPT-4o) Key</span>
                {llmProvider === 'openai' && <span className="text-[10px] bg-green-900 text-green-300 px-1.5 py-0.5 rounded">Active</span>}
              </div>
              {firm?.openaiApiKey && (
                <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded bg-gray-800/60 border border-gray-700">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  <span className="font-mono text-xs text-gray-200 flex-1 truncate">
                    {revealOpenaiKey ? firm.openaiApiKey : `${firm.openaiApiKey.substring(0, 8)}${'•'.repeat(16)}${firm.openaiApiKey.slice(-4)}`}
                  </span>
                  <button type="button" onClick={() => setRevealOpenaiKey((v) => !v)} className="text-gray-500 hover:text-gray-300">
                    {revealOpenaiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              <div className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <input type={showOpenaiKey ? 'text' : 'password'} className="input pr-10 font-mono text-sm"
                    placeholder="sk-..." value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} />
                  <button type="button" onClick={() => setShowOpenaiKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={() => openaiKeyMutation.mutate()} disabled={!openaiKey.trim() || openaiKeyMutation.isPending}
                  className="btn-primary disabled:opacity-50 text-sm">
                  {openaiKeyMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
              {openaiKeyMsg && <p className={`text-xs mt-1.5 ${openaiKeyMsg.includes('saved') ? 'text-green-400' : 'text-red-400'}`}>{openaiKeyMsg}</p>}
            </div>

            {/* Insight Engine key */}
            <div className="border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${llmProvider === 'insight_engine' ? 'bg-amber-400' : 'bg-gray-600'}`} />
                <span className="text-sm font-medium text-gray-300">Insight Engine Key</span>
                {llmProvider === 'insight_engine' && <span className="text-[10px] bg-amber-900 text-amber-300 px-1.5 py-0.5 rounded">Active</span>}
              </div>
              {firm?.insightEngineApiKey && (
                <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded bg-gray-800/60 border border-gray-700">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  <span className="font-mono text-xs text-gray-200 flex-1 truncate">
                    {revealInsightKey ? firm.insightEngineApiKey : `${firm.insightEngineApiKey.substring(0, 6)}${'•'.repeat(16)}${firm.insightEngineApiKey.slice(-4)}`}
                  </span>
                  <button type="button" onClick={() => setRevealInsightKey((v) => !v)} className="text-gray-500 hover:text-gray-300">
                    {revealInsightKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              <div className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <input type={showInsightKey ? 'text' : 'password'} className="input pr-10 font-mono text-sm"
                    placeholder="API key..." value={insightKey} onChange={(e) => setInsightKey(e.target.value)} />
                  <button type="button" onClick={() => setShowInsightKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showInsightKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={() => insightKeyMutation.mutate()} disabled={!insightKey.trim() || insightKeyMutation.isPending}
                  className="btn-primary disabled:opacity-50 text-sm">
                  {insightKeyMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
              {insightKeyMsg && <p className={`text-xs mt-1.5 ${insightKeyMsg.includes('saved') ? 'text-green-400' : 'text-red-400'}`}>{insightKeyMsg}</p>}
            </div>

            {/* LocalAI config */}
            <div className="border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${llmProvider === 'localai' ? 'bg-cyan-400' : 'bg-gray-600'}`} />
                <span className="text-sm font-medium text-gray-300">LocalAI — Self-Hosted</span>
                {llmProvider === 'localai' && <span className="text-[10px] bg-cyan-900 text-cyan-300 px-1.5 py-0.5 rounded">Active</span>}
              </div>
              <p className="text-xs text-gray-500 mb-3">
                No API key required. Runs on your own hardware — no per-token cost.
                Install LocalAI, download a model, then set the URL and model name below.
              </p>
              {(firm?.localaiBaseUrl || firm?.localaiModel) && (
                <div className="mb-3 flex items-center gap-3 px-3 py-2 rounded bg-gray-800/60 border border-gray-700">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-gray-200 truncate">{firm.localaiBaseUrl || 'http://localhost:8080/v1'}</p>
                    {firm?.localaiModel && <p className="font-mono text-xs text-gray-400 truncate">model: {firm.localaiModel}</p>}
                  </div>
                </div>
              )}
              <div className="space-y-2 mb-3">
                <div>
                  <label className="label text-xs">Base URL</label>
                  <input
                    type="text"
                    className="input font-mono text-sm"
                    placeholder="http://localhost:8080/v1"
                    value={localaiBaseUrl}
                    onChange={(e) => setLocalaiBaseUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-xs">Model Name</label>
                  <input
                    type="text"
                    className="input font-mono text-sm"
                    placeholder="llama-3.2-1b-instruct:q4_k_m"
                    value={localaiModel}
                    onChange={(e) => setLocalaiModel(e.target.value)}
                  />
                </div>
              </div>
              <button
                onClick={() => localaiMutation.mutate()}
                disabled={localaiMutation.isPending}
                className="btn-primary disabled:opacity-50 text-sm"
              >
                {localaiMutation.isPending ? 'Saving...' : 'Save LocalAI Config'}
              </button>
              {localaiMsg && <p className={`text-xs mt-1.5 ${localaiMsg.includes('saved') ? 'text-green-400' : 'text-red-400'}`}>{localaiMsg}</p>}
            </div>
          </div>

          {/* Usage Summary */}
          <div className="mt-4 border-t border-gray-800 pt-4">
            <button
              type="button"
              onClick={() => setShowUsage((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <BarChart2 className="w-4 h-4" />
              {showUsage ? 'Hide' : 'Show'} AI Usage (last 30 days)
            </button>
            {showUsage && (
              <div className="mt-3">
                {!usageData ? (
                  <Spinner />
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
                        <p className="text-lg font-semibold text-gray-100">{usageData.data?.totalCalls ?? 0}</p>
                        <p className="text-[11px] text-gray-500">Total Calls</p>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
                        <p className="text-lg font-semibold text-gray-100">
                          {((usageData.data?.totalInputTokens ?? 0) + (usageData.data?.totalOutputTokens ?? 0)).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-gray-500">Total Tokens</p>
                      </div>
                      <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
                        <p className="text-lg font-semibold text-gray-100">
                          ${(usageData.data?.totalCostUsd ?? 0).toFixed(4)}
                        </p>
                        <p className="text-[11px] text-gray-500">Est. Cost (USD)</p>
                      </div>
                    </div>
                    {(usageData.data?.byTask?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1.5">By Task</p>
                        <div className="space-y-1">
                          {usageData.data.byTask.map((t: any) => (
                            <div key={t.task} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">{t.task.replace(/_/g, ' ')}</span>
                              <span className="text-gray-300">{t.calls} calls · ${Number(t.costUsd).toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(usageData.data?.byProvider?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1.5">By Provider</p>
                        <div className="space-y-1">
                          {usageData.data.byProvider.map((p: any) => (
                            <div key={p.provider} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 capitalize">{p.provider.replace(/_/g, ' ')}</span>
                              <span className="text-gray-300">{p.calls} calls · ${Number(p.costUsd).toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {usageData.data?.totalCalls === 0 && (
                      <p className="text-xs text-gray-600 text-center py-2">No AI calls recorded in the last 30 days.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Contract Sync Settings */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-gray-200">Contract Sync Settings</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Control how the <strong className="text-gray-400">Sync Contracts</strong> button works on the Opportunities page.
            These defaults are used every time you sync — no configuration needed at sync time.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Contracts to fetch per sync</label>
              <select
                className="input"
                value={syncLimit}
                onChange={(e) => setSyncLimit(e.target.value)}
              >
                <option value="10">10 — quick refresh</option>
                <option value="25">25 — recommended</option>
                <option value="50">50 — more coverage</option>
                <option value="100">100 — maximum (takes longer)</option>
              </select>
              <p className="text-xs text-gray-600 mt-1">Larger numbers take longer but bring in more opportunities.</p>
            </div>
            <div>
              <label className="label">Industry filter <span className="text-gray-600">(optional)</span></label>
              <input
                className="input font-mono"
                placeholder="e.g. 541611 — leave blank for all industries"
                value={syncNaics}
                onChange={(e) => setSyncNaics(e.target.value)}
              />
              <p className="text-xs text-gray-600 mt-1">6-digit industry code. Leave blank to pull contracts from all industries.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => {
                localStorage.setItem(SYNC_LIMIT_KEY, syncLimit);
                localStorage.setItem(SYNC_NAICS_KEY, syncNaics);
                setSyncSaveMsg('Sync settings saved.');
                setTimeout(() => setSyncSaveMsg(''), 3000);
              }}
              className="btn-primary"
            >
              Save Sync Settings
            </button>
            {syncSaveMsg && <p className="text-sm text-green-400">{syncSaveMsg}</p>}
          </div>
        </div>

        {/* Penalty Configuration */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-gray-200">Penalty Engine Configuration</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Configure how late submission penalties are calculated. Flat fee takes priority over percentage.
          </p>

          <div className="space-y-4">
            <div>
              <label className="label">Flat Late Fee ($)</label>
              <input
                type="number"
                className="input"
                placeholder="500.00"
                value={penaltyForm.flatLateFee}
                onChange={(e) => setPenaltyForm({ ...penaltyForm, flatLateFee: e.target.value })}
              />
              <p className="text-xs text-gray-600 mt-1">Fixed dollar amount applied to all late submissions.</p>
            </div>
            <div>
              <label className="label">Percentage of Estimated Value (%)</label>
              <input
                type="number"
                className="input"
                placeholder="2.0"
                step="0.1"
                value={penaltyForm.penaltyPercent}
                onChange={(e) => setPenaltyForm({ ...penaltyForm, penaltyPercent: e.target.value })}
              />
              <p className="text-xs text-gray-600 mt-1">Used if no flat fee is set. E.g., 2% of $5M = $100K.</p>
            </div>

            {saveMsg && <p className="text-sm text-green-400">{saveMsg}</p>}

            <button
              onClick={() => penaltyMutation.mutate()}
              disabled={penaltyMutation.isPending}
              className="btn-primary"
            >
              {penaltyMutation.isPending ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>

        {/* Platform Users */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-gray-200">Platform Users</h2>
          </div>
          <div className="space-y-3">
            {users.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-sm text-gray-200">{u.firstName} {u.lastName}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.role === 'ADMIN' ? 'bg-yellow-900 text-yellow-300' : 'bg-blue-900 text-blue-300'}`}>
                    {u.role}
                  </span>
                  {u.lastLoginAt && (
                    <p className="text-xs text-gray-600 mt-1">Last login: {new Date(u.lastLoginAt).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-600">
              Firm: <span className="text-gray-400">{firm?.name}</span><br />
              Contact: <span className="text-gray-400">{firm?.contactEmail}</span><br />
              Total Clients: <span className="text-gray-400">{firm?._count?.clientCompanies}</span>
            </p>
          </div>
        </div>

        {/* Template Library Review */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-purple-400" />
            <h2 className="font-semibold text-gray-200">Template Library Review</h2>
            {pendingTemplates.length > 0 && (
              <span className="ml-2 text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full">
                {pendingTemplates.length} pending
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-4">
            When a client shares a document to the template library it enters <strong className="text-gray-400">Pending Review</strong> status.
            As an admin you review it here — approve to make it available to all firms in the library, or reject with a note explaining why.
            Approved templates are anonymized before sharing; client names are never exposed.
          </p>

          {templates.length === 0 ? (
            <p className="text-sm text-gray-600 py-4 text-center">No templates submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {templates.map((t: any) => (
                <div key={t.id} className="border border-gray-800 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-200 truncate">{t.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                          t.status === 'APPROVED' ? 'bg-green-900 text-green-300' :
                          t.status === 'REJECTED' ? 'bg-gray-700 text-gray-400' :
                          'bg-yellow-900 text-yellow-300'
                        }`}>{t.status}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Type: {t.documentType} · Submitted by: {t.submittedByFirm?.name || 'Unknown'} ·{' '}
                        {new Date(t.createdAt).toLocaleDateString()} · {t.downloadCount} downloads
                      </p>
                      {t.description && <p className="text-xs text-gray-400 mt-1">{t.description}</p>}
                      {t.reviewNotes && (
                        <p className="text-xs text-gray-500 mt-1 italic">Review note: {t.reviewNotes}</p>
                      )}
                    </div>

                    {t.status === 'PENDING' && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <input
                          type="text"
                          placeholder="Optional review note..."
                          className="input text-xs w-52"
                          value={reviewNote[t.id] || ''}
                          onChange={(e) => setReviewNote((n) => ({ ...n, [t.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => reviewMutation.mutate({ id: t.id, status: 'APPROVED' })}
                            disabled={reviewMutation.isPending}
                            className="flex-1 flex items-center justify-center gap-1 text-xs bg-green-900/50 hover:bg-green-900 text-green-300 border border-green-800 rounded px-3 py-1.5 transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => reviewMutation.mutate({ id: t.id, status: 'REJECTED' })}
                            disabled={reviewMutation.isPending}
                            className="flex-1 flex items-center justify-center gap-1 text-xs bg-red-900/30 hover:bg-red-900/60 text-red-400 border border-red-900 rounded px-3 py-1.5 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
