// =============================================================
// Shared UI Components
// =============================================================
import { ReactNode } from 'react';
import { AlertTriangle, Clock, CheckCircle, Loader2 } from 'lucide-react';

// ---- Deadline Badge ----
interface DeadlineBadgeProps {
  priority: 'RED' | 'YELLOW' | 'GREEN';
  label: string;
}

export function DeadlineBadge({ priority, label }: DeadlineBadgeProps) {
  const classes = {
    RED: 'badge-red',
    YELLOW: 'badge-yellow',
    GREEN: 'badge-green',
  }[priority];

  const icons = {
    RED: <AlertTriangle className="w-3 h-3 mr-1" />,
    YELLOW: <Clock className="w-3 h-3 mr-1" />,
    GREEN: <CheckCircle className="w-3 h-3 mr-1" />,
  }[priority];

  return (
    <span className={classes}>
      {icons}
      {label}
    </span>
  );
}

// ---- Probability Bar ----
interface ProbabilityBarProps {
  probability: number;
}

export function ProbabilityBar({ probability }: ProbabilityBarProps) {
  const pct = Math.round(probability * 100);
  const barColor =
    pct >= 60 ? '#10b981' : pct >= 35 ? '#f59e0b' : '#ef4444';
  const textColor =
    pct >= 60 ? '#6ee7b7' : pct >= 35 ? '#fde68a' : '#f87171';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full h-1.5" style={{ background: '#1a2e4a' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <span className="text-xs font-mono w-8 text-right font-bold" style={{ color: textColor }}>{pct}%</span>
    </div>
  );
}

// ---- Loading Spinner ----
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return <Loader2 className={`animate-spin ${sizes[size]}`} style={{ color: '#f59e0b' }} />;
}

// ---- Empty State ----
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16" style={{ color: '#334155' }}>
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}
      >
        <span className="text-2xl">☂</span>
      </div>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ---- Error Banner ----
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
      style={{ background: 'rgba(127,29,29,0.35)', border: '1px solid rgba(185,28,28,0.45)', color: '#fca5a5' }}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      {message}
    </div>
  );
}

// ---- Stat Card ----
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'default' | 'red' | 'yellow' | 'green' | 'blue' | 'gold';
}

export function StatCard({ label, value, sub, color = 'default' }: StatCardProps) {
  const colors: Record<string, string> = {
    default: '#e2e8f0',
    red:     '#f87171',
    yellow:  '#fde68a',
    green:   '#6ee7b7',
    blue:    '#93c5fd',
    gold:    '#f59e0b',
  };

  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Subtle gold top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: color === 'gold' || color === 'green'
          ? 'linear-gradient(90deg, #f59e0b, transparent)'
          : color === 'red'
          ? 'linear-gradient(90deg, #ef4444, transparent)'
          : 'linear-gradient(90deg, rgba(245,158,11,0.3), transparent)',
      }} />
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: '#475569', letterSpacing: '0.1em' }}>
        {label}
      </p>
      <p className="text-3xl font-black" style={{ color: colors[color] || colors.default }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-1" style={{ color: '#475569' }}>{sub}</p>}
    </div>
  );
}

// ---- Page Header ----
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-black text-slate-100" style={{ letterSpacing: '-0.01em' }}>{title}</h1>
        {subtitle && (
          <p className="text-sm mt-1" style={{ color: '#475569' }}>{subtitle}</p>
        )}
        {/* Gold rule under title */}
        <div className="mt-2 w-10 h-0.5 rounded" style={{
          background: 'linear-gradient(90deg, #f59e0b, transparent)',
        }} />
      </div>
      {children && <div className="flex gap-2 items-center">{children}</div>}
    </div>
  );
}

// ---- Currency formatter ----
export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'N/A';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return 'N/A';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
