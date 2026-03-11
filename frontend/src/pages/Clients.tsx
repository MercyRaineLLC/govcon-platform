import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clientsApi, clientPortalUsersApi } from '../services/api';
import { PageHeader, Spinner, EmptyState, ErrorBanner, formatCurrency } from '../components/ui';
import { Plus, CheckCircle, XCircle, Shield, KeyRound, X, Search, Loader2, MapPin, Phone, Globe } from 'lucide-react';

const EMPTY_FORM = {
  name: '', cage: '', uei: '', ein: '', naicsCodes: '',
  sdvosb: false, wosb: false, hubzone: false, smallBusiness: true,
  phone: '', website: '', streetAddress: '', city: '', state: '', zipCode: '',
};

export function ClientsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  // SAM.gov lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupType, setLookupType] = useState<'uei' | 'cage' | 'name'>('uei');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);

  // Portal access state
  const [portalClientId, setPortalClientId] = useState<string | null>(null);
  const [portalClientName, setPortalClientName] = useState('');
  const [portalForm, setPortalForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [portalError, setPortalError] = useState('');
  const [portalSuccess, setPortalSuccess] = useState('');

  const portalMutation = useMutation({
    mutationFn: () => clientPortalUsersApi.register({
      clientCompanyId: portalClientId!,
      ...portalForm,
    }),
    onSuccess: () => {
      setPortalSuccess(`Portal access created for ${portalForm.email}. They can now log in at /client-login.`);
      setPortalForm({ email: '', password: '', firstName: '', lastName: '' });
    },
    onError: (err: any) => setPortalError(err?.response?.data?.error || 'Failed to create portal access'),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => clientsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setLookupResult(null);
      setLookupQuery('');
    },
    onError: (err: any) => setFormError(err.response?.data?.error || 'Create failed'),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    createMutation.mutate({
      ...form,
      naicsCodes: form.naicsCodes.split(',').map((s: string) => s.trim()).filter(Boolean),
    });
  };

  const handleSamLookup = async () => {
    if (!lookupQuery.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    setLookupResult(null);
    try {
      const params =
        lookupType === 'uei'  ? { uei: lookupQuery.trim() } :
        lookupType === 'cage' ? { cage: lookupQuery.trim() } :
                                { name: lookupQuery.trim() };
      const res = await clientsApi.samLookup(params);
      const d = res.data;
      setLookupResult(d);
      // Pre-fill the create form
      setForm({
        name: d.name || '',
        cage: d.cage || '',
        uei: d.uei || '',
        ein: '',
        naicsCodes: (d.naicsCodes || []).join(', '),
        sdvosb: !!d.sdvosb,
        wosb: !!d.wosb,
        hubzone: !!d.hubzone,
        smallBusiness: !!d.smallBusiness,
        phone: d.phone || '',
        website: d.website || '',
        streetAddress: d.streetAddress || '',
        city: d.city || '',
        state: d.state || '',
        zipCode: d.zipCode || '',
      });
      setShowCreate(true);
    } catch (err: any) {
      setLookupError(err?.response?.data?.error || 'Lookup failed — entity not found or SAM.gov unavailable');
    } finally {
      setLookupLoading(false);
    }
  };

  const clients = data?.data || [];

  return (
    <div>
      <PageHeader title="Client Companies" subtitle="Government contractor portfolio">
        <button onClick={() => { setShowCreate(!showCreate); setLookupResult(null); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </PageHeader>

      {/* SAM.gov Quick Lookup */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-200 mb-1 flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-400" /> SAM.gov Entity Lookup
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Enter a UEI, CAGE code, or company name to auto-populate client details from SAM.gov.
          <span className="text-gray-600"> (EIN/Tax ID lookup is not available via the public SAM API.)</span>
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="label">Search By</label>
            <select className="input w-36" value={lookupType} onChange={(e) => { setLookupType(e.target.value as 'uei' | 'cage' | 'name'); setLookupQuery(''); }}>
              <option value="uei">UEI (exact)</option>
              <option value="cage">CAGE Code</option>
              <option value="name">Company Name</option>
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="label">
              {lookupType === 'uei'  ? 'UEI — 12 alphanumeric characters' :
               lookupType === 'cage' ? 'CAGE Code — 5 characters' :
                                       'Legal business name (as registered in SAM.gov)'}
            </label>
            <input
              className="input"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder={
                lookupType === 'uei'  ? 'QDFNQQ83G946' :
                lookupType === 'cage' ? '9V5E3' :
                                        'Acme Defense Solutions LLC'
              }
              onKeyDown={(e) => e.key === 'Enter' && handleSamLookup()}
            />
          </div>
          <button
            onClick={handleSamLookup}
            disabled={lookupLoading || !lookupQuery.trim()}
            className="btn-primary flex items-center gap-2 h-9"
          >
            {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {lookupLoading ? 'Looking up...' : 'Lookup'}
          </button>
        </div>
        {lookupError && (
          <div className="mt-3 p-3 bg-red-950/40 border border-red-800/50 rounded-lg">
            <p className="text-red-300 text-sm font-medium mb-1">Lookup failed</p>
            <p className="text-red-400 text-xs mb-2">{lookupError}</p>
            <p className="text-xs text-gray-500 mb-2">
              Tips: UEI must be exactly 12 alphanumeric chars. CAGE codes are 5 chars. For name search, use the exact legal name from SAM.gov.
            </p>
            <button
              onClick={() => { setShowCreate(true); setLookupError(''); }}
              className="btn-secondary text-xs"
            >
              Enter details manually instead
            </button>
          </div>
        )}
        {lookupResult && (
          <div className="mt-3 p-3 bg-green-950/30 border border-green-800/50 rounded-lg text-sm">
            <p className="text-green-300 font-medium mb-1">
              Found: <span className="text-white">{lookupResult.name ?? '(no name returned)'}</span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
              {lookupResult.uei && <span>UEI: <span className="font-mono text-gray-300">{lookupResult.uei}</span></span>}
              {lookupResult.cage && <span>CAGE: <span className="font-mono text-gray-300">{lookupResult.cage}</span></span>}
              {lookupResult.samRegStatus && (
                <span>SAM: <span className={lookupResult.samRegStatus === 'Active' ? 'text-green-400' : 'text-yellow-400'}>{lookupResult.samRegStatus}</span></span>
              )}
              {lookupResult.city && <span>{lookupResult.city}{lookupResult.state ? `, ${lookupResult.state}` : ''}</span>}
              {lookupResult.naicsCodes?.length > 0 && (
                <span>{lookupResult.naicsCodes.length} NAICS code{lookupResult.naicsCodes.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <p className="text-xs text-blue-400 mt-1">
              Form has been pre-filled below. Review certifications and click Create Client.
            </p>
          </div>
        )}
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-200 mb-4">New Client Company</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Core IDs */}
            <div>
              <label className="label">Company Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">EIN / Tax ID</label>
              <input className="input font-mono" value={form.ein} onChange={(e) => setForm({ ...form, ein: e.target.value })} placeholder="12-3456789" />
            </div>
            <div>
              <label className="label">UEI</label>
              <input className="input font-mono" value={form.uei} onChange={(e) => setForm({ ...form, uei: e.target.value })} />
            </div>
            <div>
              <label className="label">CAGE Code</label>
              <input className="input font-mono" value={form.cage} onChange={(e) => setForm({ ...form, cage: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="label">NAICS Codes (comma-separated)</label>
              <input className="input" value={form.naicsCodes} onChange={(e) => setForm({ ...form, naicsCodes: e.target.value })} placeholder="484121, 541614" />
            </div>

            {/* Contact & Address */}
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Street Address</label>
              <input className="input" value={form.streetAddress} onChange={(e) => setForm({ ...form, streetAddress: e.target.value })} placeholder="123 Main St" />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">State</label>
                <input className="input font-mono" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="VA" maxLength={2} />
              </div>
              <div>
                <label className="label">ZIP</label>
                <input className="input font-mono" value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} placeholder="20001" />
              </div>
            </div>

            {/* Certifications */}
            <div className="md:col-span-2">
              <label className="label">Certifications</label>
              <div className="flex flex-wrap gap-4">
                {[
                  { key: 'sdvosb', label: 'SDVOSB' },
                  { key: 'wosb', label: 'WOSB' },
                  { key: 'hubzone', label: 'HUBZone' },
                  { key: 'smallBusiness', label: 'Small Business' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(form as any)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500"
                    />
                    <span className="text-sm text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {formError && <div className="md:col-span-2"><ErrorBanner message={formError} /></div>}

            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? 'Creating...' : 'Create Client'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setLookupResult(null); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Portal Access Modal */}
      {portalClientId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-400" />
                Client Portal Access — {portalClientName}
              </h3>
              <button onClick={() => { setPortalClientId(null); setPortalSuccess(''); setPortalError(''); }}
                className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Create login credentials for a contact at this client company. They will log in at <span className="text-blue-400">/client-login</span>.
            </p>
            {portalSuccess ? (
              <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-lg p-3 text-sm">{portalSuccess}</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">First Name</label>
                    <input className="input" value={portalForm.firstName}
                      onChange={(e) => setPortalForm({ ...portalForm, firstName: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Last Name</label>
                    <input className="input" value={portalForm.lastName}
                      onChange={(e) => setPortalForm({ ...portalForm, lastName: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" className="input" value={portalForm.email}
                    onChange={(e) => setPortalForm({ ...portalForm, email: e.target.value })} />
                </div>
                <div>
                  <label className="label">Temporary Password</label>
                  <input type="password" className="input" value={portalForm.password}
                    onChange={(e) => setPortalForm({ ...portalForm, password: e.target.value })} />
                </div>
                {portalError && <ErrorBanner message={portalError} />}
                <button
                  onClick={() => { setPortalError(''); portalMutation.mutate(); }}
                  disabled={!portalForm.email || !portalForm.password || !portalForm.firstName || portalMutation.isPending}
                  className="btn-primary w-full"
                >
                  {portalMutation.isPending ? 'Creating...' : 'Create Portal Access'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading && <div className="flex justify-center mt-10"><Spinner size="lg" /></div>}
      {error && <ErrorBanner message="Failed to load clients" />}
      {!isLoading && clients.length === 0 && <EmptyState message="No clients yet. Add your first client company." />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client: any) => (
          <div key={client.id} className="card hover:border-gray-600 transition-colors relative">
          <button
            onClick={(e) => {
              e.preventDefault();
              setPortalClientId(client.id);
              setPortalClientName(client.name);
              setPortalSuccess('');
              setPortalError('');
            }}
            title="Grant client portal access"
            className="absolute top-3 right-3 text-gray-600 hover:text-blue-400 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <Link to={`/clients/${client.id}`} className="block">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-200">{client.name}</h3>
                {client.uei && <p className="text-xs text-gray-500 font-mono">UEI: {client.uei}</p>}
              </div>
              {client.sdvosb && (
                <span className="flex items-center gap-1 text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">
                  <Shield className="w-3 h-3" />
                  SDVOSB
                </span>
              )}
            </div>

            {/* NAICS */}
            {client.naicsCodes?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {client.naicsCodes.slice(0, 3).map((code: string) => (
                  <span key={code} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">
                    {code}
                  </span>
                ))}
                {client.naicsCodes.length > 3 && (
                  <span className="text-xs text-gray-500">+{client.naicsCodes.length - 3}</span>
                )}
              </div>
            )}

            {/* Stats */}
            {client.performanceStats && (
              <div className="border-t border-gray-800 pt-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-500">Completion Rate</p>
                  <div className="flex items-center gap-1">
                    {client.performanceStats.completionRate >= 0.8 ? (
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400" />
                    )}
                    <span className="text-sm font-mono text-gray-200">
                      {Math.round(client.performanceStats.completionRate * 100)}%
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Penalties</p>
                  <p className={`text-sm font-mono ${client.performanceStats.totalPenalties > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {formatCurrency(client.performanceStats.totalPenalties)}
                  </p>
                </div>
              </div>
            )}
          </Link>
        </div>
        ))}
      </div>
    </div>
  );
}
