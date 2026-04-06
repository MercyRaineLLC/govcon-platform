import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/api';
import { Eye, EyeOff, Star, Shield, TrendingUp, Award } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Inline Umbrella SVG — Mercy Raine brand mark                       */
/* ------------------------------------------------------------------ */
function UmbrellaLogo({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="canopyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Canopy dome */}
      <path d="M32 7 C15 7 3 19 3 33 L61 33 C61 19 49 7 32 7Z" fill="url(#canopyGrad)" />
      {/* Ribs */}
      <line x1="32" y1="7"  x2="32" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="20" y1="9.5" x2="22" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="44" y1="9.5" x2="42" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="10" y1="17" x2="14" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      <line x1="54" y1="17" x2="50" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35" />
      {/* Edge scallop */}
      <path d="M3 33 Q6 37 10 35 Q16 38.5 22 35 Q26 37.5 32 35 Q38 37.5 42 35 Q48 38.5 54 35 Q58 37 61 33"
        fill="#fbbf24" opacity="0.5" />
      {/* Handle */}
      <line x1="32" y1="33" x2="32" y2="54" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 54 Q32 61 25 61 Q20 61 20 55.5"
        stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Trust pillars shown on brand panel                                 */
/* ------------------------------------------------------------------ */
const pillars = [
  { icon: Shield,     label: 'Veteran Owned', sub: 'Veteran Owned & Operated' },
  { icon: TrendingUp, label: 'AI-Powered',    sub: '8-Factor Win Scoring' },
  { icon: Award,      label: 'Proven Results',sub: 'Federal Pipeline Intel' },
];

/* ================================================================== */

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      if (!res?.success || !res?.data?.token) {
        setError('Invalid credentials');
        setLoading(false);
        return;
      }
      const { token, user, firm } = res.data;
      login(token, user, firm);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#040d1a' }}>

      {/* ============================================================ */}
      {/* LEFT PANEL — Brand Showcase                                  */}
      {/* ============================================================ */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-14 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #071120 0%, #0b1628 40%, #091522 100%)',
          borderRight: '1px solid rgba(245,158,11,0.15)',
        }}
      >
        {/* Ambient gold glow — top right */}
        <div
          className="absolute top-0 right-0 w-96 h-96 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at top right, rgba(245,158,11,0.12) 0%, transparent 65%)',
          }}
        />
        {/* Ambient glow — bottom left */}
        <div
          className="absolute bottom-0 left-0 w-80 h-80 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at bottom left, rgba(245,158,11,0.07) 0%, transparent 65%)',
          }}
        />

        {/* Top: logo + company name */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-2">
            <UmbrellaLogo size={52} />
            <div>
              <p className="text-xs font-bold tracking-[0.15em] uppercase text-amber-400/70">Mr GovCon</p>
              <p className="text-[11px] text-slate-500 tracking-widest">GovCon Advisory Intelligence</p>
            </div>
          </div>
          <div className="mt-2">
            <span className="veteran-badge">
              ★ Veteran Owned & Operated
            </span>
          </div>
        </div>

        {/* Center: headline + motto */}
        <div className="relative z-10 animate-fade-up">
          {/* Gold rule */}
          <div
            className="w-12 h-1 rounded-full mb-8"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }}
          />

          <h1
            className="text-5xl font-black leading-tight mb-6"
            style={{ color: '#f8fafc', letterSpacing: '-0.02em' }}
          >
            Win More.<br />
            <span style={{
              background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Bid Smarter.
            </span>
          </h1>

          <p className="text-lg text-slate-400 leading-relaxed mb-4 max-w-sm">
            AI-powered federal contract intelligence that turns SAM.gov noise into
            clear, confident bid decisions — for your entire client portfolio.
          </p>

          {/* Motto */}
          <p
            className="text-sm italic font-medium"
            style={{ color: 'rgba(245,158,11,0.8)' }}
          >
            "Empowering All Small Businesses to Win Government Contracts."
          </p>

          {/* Trust pillars */}
          <div className="grid grid-cols-3 gap-4 mt-10">
            {pillars.map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="flex flex-col gap-1.5 p-3 rounded-lg"
                style={{
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.14)',
                }}
              >
                <Icon className="w-4 h-4 text-amber-400" />
                <p className="text-xs font-semibold text-slate-200">{label}</p>
                <p className="text-[10px] text-slate-500">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: trust line */}
        <div className="relative z-10 flex items-center gap-3">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3 h-3 text-amber-400" fill="currentColor" />
          ))}
          <p className="text-xs text-slate-500 ml-1">
            Trusted by GovCon consultants nationwide
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* RIGHT PANEL — Login Form                                     */}
      {/* ============================================================ */}
      <div className="flex flex-1 flex-col justify-center items-center p-8"
        style={{ background: '#040d1a' }}>

        {/* Mobile-only logo */}
        <div className="flex lg:hidden flex-col items-center mb-8">
          <UmbrellaLogo size={48} />
          <p className="text-sm font-bold tracking-widest uppercase text-amber-400 mt-3">Mr GovCon</p>
          <p className="text-xs text-slate-500 mt-0.5">GovCon Advisory Intelligence</p>
        </div>

        <div className="w-full max-w-sm">
          {/* Form heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-100 mb-1">Welcome back</h2>
            <p className="text-sm text-slate-500">Sign in to your advisory platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input"
                placeholder="you@firm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-400 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="text-sm rounded-lg px-4 py-3 flex items-center gap-2"
                style={{ background: 'rgba(127,29,29,0.4)', border: '1px solid rgba(185,28,28,0.5)', color: '#fca5a5' }}
              >
                <span className="text-red-400">✕</span> {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Authenticating...
                </span>
              ) : 'Sign In →'}
            </button>
          </form>

          <div
            className="mt-6 pt-5 text-center"
            style={{ borderTop: '1px solid #1a2e4a' }}
          >
            <p className="text-sm text-slate-500">
              New consulting firm?{' '}
              <Link
                to="/register"
                className="font-semibold transition-colors"
                style={{ color: '#f59e0b' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#fbbf24')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#f59e0b')}
              >
                Register your firm →
              </Link>
            </p>
          </div>

          {/* Bottom badge */}
          <div className="mt-8 flex items-center justify-center gap-2">
            <div
              className="flex items-center gap-1.5 text-[10px] px-3 py-1 rounded-full"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: 'rgba(245,158,11,0.7)' }}
            >
              <span>★</span>
              <span>Veteran Owned & Operated · Secured Platform</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
