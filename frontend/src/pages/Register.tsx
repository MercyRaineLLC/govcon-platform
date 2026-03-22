import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/api';
import { CheckCircle } from 'lucide-react';

function UmbrellaLogo({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="regCanopy" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M32 7 C15 7 3 19 3 33 L61 33 C61 19 49 7 32 7Z" fill="url(#regCanopy)" />
      <line x1="32" y1="7"  x2="32" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="20" y1="9.5" x2="22" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="44" y1="9.5" x2="42" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="10" y1="17" x2="14" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="54" y1="17" x2="50" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <path d="M3 33 Q6 37 10 35 Q16 38.5 22 35 Q26 37.5 32 35 Q38 37.5 42 35 Q48 38.5 54 35 Q58 37 61 33" fill="#fbbf24" opacity="0.5" />
      <line x1="32" y1="33" x2="32" y2="54" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 54 Q32 61 25 61 Q20 61 20 55.5" stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const perks = [
  'Real-time SAM.gov opportunity ingestion',
  'AI win probability scoring per client',
  'Monte Carlo revenue forecasting',
  'Compliance matrix & document intelligence',
  'Full client portal included',
];

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firmName: '', contactEmail: '', firstName: '', lastName: '', password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.registerFirm(form);
      login(res.data.token, res.data.user, res.data.firm);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#040d1a' }}>

      {/* ---- Left brand strip ---- */}
      <div
        className="hidden lg:flex flex-col justify-between w-2/5 p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #071120 0%, #0b1628 100%)',
          borderRight: '1px solid rgba(245,158,11,0.15)',
        }}
      >
        <div
          className="absolute top-0 right-0 w-96 h-96 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at top right, rgba(245,158,11,0.1) 0%, transparent 65%)' }}
        />

        {/* Brand identity */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <UmbrellaLogo size={44} />
            <div>
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-amber-400/80">Mercy Raine LLC</p>
              <p className="text-[10px] text-slate-500 tracking-widest">GovCon Advisory Intelligence</p>
            </div>
          </div>
          <span className="veteran-badge">★ SDVOSB · Veteran-Owned</span>
        </div>

        {/* Value props */}
        <div className="relative z-10">
          <div className="w-10 h-0.5 rounded mb-6" style={{ background: 'linear-gradient(90deg, #f59e0b, transparent)' }} />
          <h2 className="text-3xl font-black text-slate-100 leading-snug mb-3">
            Your clients deserve<br />
            <span style={{ background: 'linear-gradient(90deg,#f59e0b,#fbbf24)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              better intel.
            </span>
          </h2>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            Everything you need to run a data-driven GovCon advisory practice — starting free.
          </p>
          <ul className="space-y-3">
            {perks.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-slate-400">{perk}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs italic text-amber-400/60">
          "Transporting Freight, Lives."
        </p>
      </div>

      {/* ---- Right form panel ---- */}
      <div className="flex flex-1 flex-col justify-center items-center p-8" style={{ background: '#040d1a' }}>

        {/* Mobile logo */}
        <div className="flex lg:hidden flex-col items-center mb-6">
          <UmbrellaLogo size={40} />
          <p className="text-xs font-bold tracking-widest uppercase text-amber-400 mt-2">Mercy Raine LLC</p>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-slate-100 mb-1">Register your firm</h2>
            <p className="text-sm text-slate-500">Create your advisory intelligence account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Consulting Firm Name</label>
              <input className="input" value={form.firmName}
                onChange={(e) => setForm({ ...form, firmName: e.target.value })}
                required placeholder="e.g. Apex Federal Advisory LLC" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name</label>
                <input className="input" value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div>
                <label className="label">Last Name</label>
                <input className="input" value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
            </div>

            <div>
              <label className="label">Email Address</label>
              <input type="email" className="input" value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required
                placeholder="you@yourfirm.com" />
            </div>

            <div>
              <label className="label">Password</label>
              <input type="password" className="input" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} required
                placeholder="Min 12 chars — upper, lower, number, symbol" />
              <p className="text-[11px] text-slate-600 mt-1 ml-0.5">
                Must include uppercase, lowercase, a number, and a symbol
              </p>
            </div>

            {error && (
              <div className="text-sm rounded-lg px-4 py-3"
                style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(185,28,28,0.5)', color: '#fca5a5' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating account...
                </span>
              ) : 'Create Firm Account →'}
            </button>
          </form>

          <div className="mt-5 pt-5 text-center" style={{ borderTop: '1px solid #1a2e4a' }}>
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold" style={{ color: '#f59e0b' }}>
                Sign in →
              </Link>
            </p>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="flex items-center gap-1.5 text-[10px] px-3 py-1 rounded-full"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'rgba(245,158,11,0.7)' }}>
              <span>★</span>
              <span>SDVOSB · Veteran-Owned · Secured Platform</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
