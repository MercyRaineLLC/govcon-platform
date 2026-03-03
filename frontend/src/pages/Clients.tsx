import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clientsApi } from '../services/api';
import { PageHeader, StatCard, Spinner, EmptyState, ErrorBanner, formatCurrency } from '../components/ui';
import { Plus, CheckCircle, XCircle, Shield } from 'lucide-react';

export function ClientsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', cage: '', uei: '', naicsCodes: '',
    sdvosb: false, wosb: false, hubzone: false, smallBusiness: true,
  });
  const [formError, setFormError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => clientsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setShowCreate(false);
      setForm({ name: '', cage: '', uei: '', naicsCodes: '', sdvosb: false, wosb: false, hubzone: false, smallBusiness: true });
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

  const clients = data?.data || [];

  return (
    <div>
      <PageHeader title="Client Companies" subtitle="Government contractor portfolio">
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </PageHeader>

      {/* Create Form */}
      {showCreate && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-200 mb-4">New Client Company</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Company Name *</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">UEI</label>
              <input className="input" value={form.uei} onChange={(e) => setForm({ ...form, uei: e.target.value })} />
            </div>
            <div>
              <label className="label">CAGE Code</label>
              <input className="input" value={form.cage} onChange={(e) => setForm({ ...form, cage: e.target.value })} />
            </div>
            <div>
              <label className="label">NAICS Codes (comma-separated)</label>
              <input className="input" value={form.naicsCodes} onChange={(e) => setForm({ ...form, naicsCodes: e.target.value })} placeholder="484121, 541614" />
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
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isLoading && <div className="flex justify-center mt-10"><Spinner size="lg" /></div>}
      {error && <ErrorBanner message="Failed to load clients" />}
      {!isLoading && clients.length === 0 && <EmptyState message="No clients yet. Add your first client company." />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client: any) => (
          <Link
            key={client.id}
            to={`/clients/${client.id}`}
            className="card hover:border-gray-600 transition-colors"
          >
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
        ))}
      </div>
    </div>
  );
}
