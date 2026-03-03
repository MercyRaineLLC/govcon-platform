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
  const color =
    pct >= 60 ? 'bg-green-500' : pct >= 35 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-300 w-8">{pct}%</span>
    </div>
  );
}

// ---- Loading Spinner ----
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return <Loader2 className={`animate-spin text-blue-400 ${sizes[size]}`} />;
}

// ---- Empty State ----
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-4xl mb-3">📭</div>
      <p>{message}</p>
    </div>
  );
}

// ---- Error Banner ----
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-md px-4 py-3 text-sm">
      {message}
    </div>
  );
}

// ---- Stat Card ----
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'default' | 'red' | 'yellow' | 'green' | 'blue';
}

export function StatCard({ label, value, sub, color = 'default' }: StatCardProps) {
  const colors = {
    default: 'text-gray-100',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    green: 'text-green-400',
    blue: 'text-blue-400',
  };

  return (
    <div className="card">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ---- Page Header ----
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

// ---- Currency formatter ----
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'N/A';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
