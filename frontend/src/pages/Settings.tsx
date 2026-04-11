import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { firmApi, clientDocumentsApi } from '../services/api';
import { PageHeader, Spinner } from '../components/ui';
import { Settings, Users, Key, Eye, EyeOff, CheckCircle, XCircle, BookOpen, Brain, RefreshCw, BarChart2, Shield } from 'lucide-react';

const SYNC_LIMIT_KEY = 'govcon_sync_limit';
const SYNC_NAICS_KEY = 'govcon_sync_naics';

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  claude:         { label: 'Claude (Anthropic)',  color: 'purple' },
  openai:         { label: 'OpenAI (GPT-4o)',     color: 'green'  },
  deepseek:       { label: 'DeepSeek V3',         color: 'blue'   },
  insight_engine: { label: 'Insight Engine',      color: 'amber'  },
  localai:        { label: 'Ollama (Local)',       color: 'cyan'   },
}

export function SettingsPage() {
  const qc = useQueryClient();
  const [penaltyForm, setPenaltyForm] = useState({ flatLateFee: '', penaltyPercent: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [samKey, setSamKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [samKeyMsg, setSamKeyMsg] = useState('');
  const [showUsage, setShowUsage] = useState(false);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [selectedProvider, setSelectedProvider] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [insightKey, setInsightKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showInsightKey, setShowInsightKey] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [aiKeyMsg, setAiKeyMsg] = useState('');
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
      if (data.data.localaiBaseUrl) setOllamaUrl(data.data.localaiBaseUrl);
      if (data.data.localaiModel) setOllamaModel(data.data.localaiModel);
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

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      clientDocumentsApi.reviewTemplate(id, { status, reviewNotes: reviewNote[id] || undefined }),
    onSuccess: () => {
      refetchTemplates();
      qc.invalidateQueries({ queryKey: ['templates-admin'] });
    },
  });

  const providerMutation = useMutation({
    mutationFn: (provider: string) => firmApi.updateLlmProvider(provider),
    onSuccess: (_data, provider) => {
      setAiKeyMsg(`AI provider updated to ${PROVIDER_LABELS[provider]?.label ?? provider}.`);
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setAiKeyMsg(''), 4000);
    },
    onError: (err: any) => setAiKeyMsg(err?.response?.data?.error || 'Failed to update provider'),
  });

  const anthropicKeyMutation = useMutation({
    mutationFn: (key: string) => firmApi.updateAnthropicApiKey(key),
    onSuccess: () => {
      setAiKeyMsg('Anthropic API key saved.');
      setAnthropicKey('');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setAiKeyMsg(''), 4000);
    },
    onError: (err: any) => setAiKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const openaiKeyMutation = useMutation({
    mutationFn: (key: string) => firmApi.updateOpenaiApiKey(key),
    onSuccess: () => {
      setAiKeyMsg('OpenAI API key saved.');
      setOpenaiKey('');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setAiKeyMsg(''), 4000);
    },
    onError: (err: any) => setAiKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const insightKeyMutation = useMutation({
    mutationFn: (key: string) => firmApi.updateInsightEngineApiKey(key),
    onSuccess: () => {
      setAiKeyMsg('Insight Engine API key saved.');
      setInsightKey('');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setAiKeyMsg(''), 4000);
    },
    onError: (err: any) => setAiKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const ollamaMutation = useMutation({
    mutationFn: () => firmApi.updateLocalaiConfig({ localaiBaseUrl: ollamaUrl.trim() || undefined, localaiModel: ollamaModel.trim() || undefined }),
    onSuccess: () => {
      setAiKeyMsg('Ollama configuration saved.');
      qc.invalidateQueries({ queryKey: ['firm'] });
      setTimeout(() => setAiKeyMsg(''), 4000);
    },
    onError: (err: any) => setAiKeyMsg(err?.response?.data?.error || 'Save failed'),
  });

  const firm = data?.data;
  const users = usersData?.data || [];
  const templates: any[] = templatesData?.data || [];
  const pendingTemplates = templates.filter((t) => t.status === 'PENDING');

  const activeProvider = firm?.llmProvider || 'claude';
  const providerInfo = PROVIDER_LABELS[activeProvider] ?? { label: activeProvider, color: 'gray' };

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
          </p>

          {firm?.samApiKeyConfigured && (
            <div className="mb-4 flex items-center gap-3 px-3 py-2 rounded-lg bg-green-900/20 border border-green-800/40">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-300 flex-1">SAM.gov API key is configured. Enter a new key below to replace it.</span>
            </div>
          )}

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">{firm?.samApiKeyConfigured ? 'Replace SAM.gov API Key' : 'New SAM.gov API Key'}</label>
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

        {/* Veteran Discount */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-semibold text-gray-200">Veteran Owned & Operated — 10% Discount</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Veteran-owned firms are eligible for a 10% discount on monthly subscription costs.
                To apply, contact us at <a href="mailto:support@mercyraine.com?subject=Veteran Discount Request" className="text-amber-400 hover:text-amber-300 underline">support@mercyraine.com</a> with
                proof of veteran status (DD-214, VA letter, or SBA VetCert).
              </p>
            </div>
          </div>
          {firm?.isVeteranOwned ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              Veteran discount active — 10% off your monthly plan. Thank you for your service.
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              Not yet verified — email us to get your veteran discount applied to your account.
            </div>
          )}
        </div>

        {/* AI Intelligence Provider — fully configurable */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-purple-400" />
            <h2 className="font-semibold text-gray-200">AI Intelligence Provider</h2>
            <div className={`ml-auto flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium ${
              providerInfo.color === 'purple' ? 'bg-purple-900/20 border-purple-700 text-purple-300' :
              providerInfo.color === 'green'  ? 'bg-green-900/20  border-green-700  text-green-300'  :
              providerInfo.color === 'amber'  ? 'bg-amber-900/20  border-amber-700  text-amber-300'  :
              providerInfo.color === 'cyan'   ? 'bg-cyan-900/20   border-cyan-700   text-cyan-300'   :
                                                'bg-gray-800      border-gray-700   text-gray-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                providerInfo.color === 'purple' ? 'bg-purple-400' :
                providerInfo.color === 'green'  ? 'bg-green-400'  :
                providerInfo.color === 'amber'  ? 'bg-amber-400'  :
                providerInfo.color === 'cyan'   ? 'bg-cyan-400'   : 'bg-gray-400'
              }`} />
              {providerInfo.label} · Active
            </div>
          </div>

          {/* Provider selector */}
          <div className="mb-4">
            <label className="label">Active Provider</label>
            <div className="flex gap-3 items-center">
              <select
                className="input flex-1"
                value={selectedProvider || activeProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                {Object.entries(PROVIDER_LABELS).map(([val, info]) => (
                  <option key={val} value={val}>{info.label}</option>
                ))}
              </select>
              <button
                onClick={() => providerMutation.mutate(selectedProvider || activeProvider)}
                disabled={providerMutation.isPending || (selectedProvider || activeProvider) === activeProvider}
                className="btn-primary disabled:opacity-50 whitespace-nowrap"
              >
                {providerMutation.isPending ? 'Saving...' : 'Switch Provider'}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Claude uses the built-in platform key. OpenAI, Insight Engine, and LocalAI use your own keys below.
            </p>
          </div>

          {/* API Keys */}
          <div className="space-y-3 border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">API Keys</p>

            {/* Anthropic */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">Anthropic (Claude) Key</label>
                <div className="relative">
                  <input
                    type={showAnthropicKey ? 'text' : 'password'}
                    className="input pr-10 font-mono text-sm"
                    placeholder={firm?.anthropicApiKeyConfigured ? '••••••••••••••••••••' : 'sk-ant-...'}
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowAnthropicKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button onClick={() => anthropicKeyMutation.mutate(anthropicKey)}
                disabled={!anthropicKey.trim() || anthropicKeyMutation.isPending}
                className="btn-primary disabled:opacity-50">
                {anthropicKeyMutation.isPending ? 'Saving...' : firm?.anthropicApiKeyConfigured ? 'Replace' : 'Save'}
              </button>
            </div>

            {/* OpenAI */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">OpenAI Key</label>
                <div className="relative">
                  <input
                    type={showOpenaiKey ? 'text' : 'password'}
                    className="input pr-10 font-mono text-sm"
                    placeholder={firm?.openaiApiKeyConfigured ? '••••••••••••••••••••' : 'sk-proj-...'}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowOpenaiKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button onClick={() => openaiKeyMutation.mutate(openaiKey)}
                disabled={!openaiKey.trim() || openaiKeyMutation.isPending}
                className="btn-primary disabled:opacity-50">
                {openaiKeyMutation.isPending ? 'Saving...' : firm?.openaiApiKeyConfigured ? 'Replace' : 'Save'}
              </button>
            </div>

            {/* Insight Engine */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">Insight Engine Key</label>
                <div className="relative">
                  <input
                    type={showInsightKey ? 'text' : 'password'}
                    className="input pr-10 font-mono text-sm"
                    placeholder={firm?.insightEngineApiKeyConfigured ? '••••••••••••••••••••' : 'sk-...'}
                    value={insightKey}
                    onChange={(e) => setInsightKey(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowInsightKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showInsightKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button onClick={() => insightKeyMutation.mutate(insightKey)}
                disabled={!insightKey.trim() || insightKeyMutation.isPending}
                className="btn-primary disabled:opacity-50">
                {insightKeyMutation.isPending ? 'Saving...' : firm?.insightEngineApiKeyConfigured ? 'Replace' : 'Save'}
              </button>
            </div>

            {/* Ollama (Local) */}
            <div className="border border-cyan-800/30 rounded-xl p-4 bg-cyan-900/5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                <span className="text-xs font-semibold text-cyan-300">Ollama — Local AI Engine</span>
                {(selectedProvider || activeProvider) === 'localai' && (
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">Active</span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Runs entirely on your machine — no API costs. Default URL: <code className="text-cyan-400 text-[11px]">http://localhost:11434/v1</code>
              </p>

              {/* Quick model reference */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { model: 'mistral:7b-instruct', note: '4.1 GB · default · fast', recommended: true },
                  { model: 'llama3.1:8b',         note: '4.7 GB · 128k context'  },
                  { model: 'phi4:14b',             note: '9.1 GB · best analysis' },
                  { model: 'qwen2.5:14b',          note: '9.0 GB · best writing'  },
                ].map(({ model, note, recommended }) => (
                  <button
                    key={model}
                    onClick={() => setOllamaModel(model)}
                    className={`text-left px-2.5 py-1.5 rounded-lg transition-all border ${
                      ollamaModel === model
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                        : 'bg-white/[0.03] border-white/[0.07] text-gray-400 hover:border-cyan-700/40 hover:text-gray-300'
                    }`}
                  >
                    <span className="font-mono font-medium">{model}</span>
                    {recommended && <span className="ml-1 text-amber-400">★</span>}
                    <br />
                    <span className="text-gray-600">{note}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-600">
                Pull a model: <code className="text-cyan-500">docker exec govcon_ollama ollama pull mistral:7b-instruct</code>
              </p>

              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="label">Ollama API URL</label>
                  <input
                    type="text"
                    className="input font-mono text-sm"
                    placeholder="http://localhost:11434/v1"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label className="label">Model</label>
                  <input
                    type="text"
                    className="input font-mono text-sm"
                    placeholder="mistral:7b-instruct"
                    value={ollamaModel}
                    onChange={(e) => setOllamaModel(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => ollamaMutation.mutate()}
                  disabled={ollamaMutation.isPending}
                  className="btn-primary disabled:opacity-50 whitespace-nowrap"
                >
                  {ollamaMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {aiKeyMsg && (
              <p className={`text-sm ${aiKeyMsg.includes('failed') || aiKeyMsg.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                {aiKeyMsg}
              </p>
            )}
          </div>

          {/* Usage Summary */}
          <div className="border-t border-gray-800 pt-4 mt-4">
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
            Approve to make it available to all firms, or reject with a note.
            Approved templates are anonymized before sharing.
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
