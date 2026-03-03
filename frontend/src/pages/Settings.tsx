import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { firmApi } from '../services/api';
import { PageHeader, ErrorBanner, Spinner } from '../components/ui';
import { Settings, Users } from 'lucide-react';

export function SettingsPage() {
  const qc = useQueryClient();
  const [penaltyForm, setPenaltyForm] = useState({ flatLateFee: '', penaltyPercent: '' });
  const [saveMsg, setSaveMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['firm'],
    queryFn: () => firmApi.get(),
  });

  const { data: usersData } = useQuery({
    queryKey: ['firm-users'],
    queryFn: () => firmApi.users(),
  });

  useEffect(() => {
    if (data?.data) {
      setPenaltyForm({
        flatLateFee: data.data.flatLateFee?.toString() || '',
        penaltyPercent: data.data.penaltyPercent ? (data.data.penaltyPercent * 100).toString() : '',
      });
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

  const firm = data?.data;
  const users = usersData?.data || [];

  if (isLoading) return <div className="flex justify-center mt-10"><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Firm configuration and administration" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Firm Details */}
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
      </div>
    </div>
  );
}
