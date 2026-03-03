import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { submissionsApi, clientsApi, opportunitiesApi } from '../services/api';
import { PageHeader, Spinner, EmptyState, ErrorBanner } from '../components/ui';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export function SubmissionsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ clientCompanyId: '', opportunityId: '', submittedAt: '', notes: '' });
  const [formError, setFormError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['submissions'],
    queryFn: () => submissionsApi.list({ limit: 50 }),
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients-select'],
    queryFn: () => clientsApi.list({ limit: 100, active: true }),
  });

  const { data: oppsData } = useQuery({
    queryKey: ['opps-select'],
    queryFn: () => opportunitiesApi.search({ status: 'ACTIVE', limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => submissionsApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submissions'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setShowCreate(false);
      setForm({ clientCompanyId: '', opportunityId: '', submittedAt: '', notes: '' });
    },
    onError: (err: any) => setFormError(err.response?.data?.error || 'Submission failed'),
  });

  const submissions = data?.data || [];
  const clients = clientsData?.data || [];
  const opportunities = oppsData?.data || [];

  return (
    <div>
      <PageHeader title="Submission Records" subtitle="Bid submission tracking and accountability">
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Log Submission
        </button>
      </PageHeader>

      {showCreate && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-200 mb-4">Log Bid Submission</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); setFormError(''); createMutation.mutate({ ...form, submittedAt: new Date(form.submittedAt).toISOString() }); }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div>
              <label className="label">Client Company *</label>
              <select className="input" value={form.clientCompanyId} onChange={(e) => setForm({ ...form, clientCompanyId: e.target.value })} required>
                <option value="">Select client...</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Opportunity *</label>
              <select className="input" value={form.opportunityId} onChange={(e) => setForm({ ...form, opportunityId: e.target.value })} required>
                <option value="">Select opportunity...</option>
                {opportunities.map((o: any) => <option key={o.id} value={o.id}>{o.title.substring(0, 60)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Submission Date/Time *</label>
              <input type="datetime-local" className="input" value={form.submittedAt} onChange={(e) => setForm({ ...form, submittedAt: e.target.value })} required />
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>

            {formError && <div className="md:col-span-2"><ErrorBanner message={formError} /></div>}

            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? 'Logging...' : 'Log Submission'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isLoading && <div className="flex justify-center mt-10"><Spinner size="lg" /></div>}
      {error && <ErrorBanner message="Failed to load submissions" />}
      {!isLoading && submissions.length === 0 && <EmptyState message="No submissions logged yet." />}

      <div className="space-y-2">
        {submissions.map((sub: any) => (
          <div key={sub.id} className="card flex items-center gap-4">
            <div className="flex-shrink-0">
              {sub.wasOnTime
                ? <CheckCircle className="w-5 h-5 text-green-400" />
                : <XCircle className="w-5 h-5 text-red-400" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{sub.opportunity?.title}</p>
              <p className="text-xs text-gray-500">
                {sub.clientCompany?.name} · Submitted by {sub.submittedBy?.firstName} {sub.submittedBy?.lastName}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400">{sub.submittedAt ? format(new Date(sub.submittedAt), 'MMM d, yyyy HH:mm') : 'N/A'}</p>
              <p className={`text-xs font-semibold ${sub.wasOnTime ? 'text-green-400' : 'text-red-400'}`}>
                {sub.wasOnTime ? 'ON TIME' : 'LATE'}
              </p>
            </div>
            {!sub.wasOnTime && sub.penaltyAmount > 0 && (
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">Penalty</p>
                <p className="text-sm font-mono text-red-400">${sub.penaltyAmount.toFixed(2)}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
