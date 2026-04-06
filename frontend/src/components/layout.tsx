import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed'
import { useFavorites } from '../hooks/useFavorites'
import {
  LayoutDashboard,
  Search,
  Users,
  FileText,
  DollarSign,
  Settings,
  LogOut,
  ClipboardList,
  ExternalLink,
  BarChart3,
  Scale,
  ShieldCheck,
  BookMarked,
  Gift,
  Clock,
  Star,
  ChevronDown,
  ChevronRight,
  X,
  CreditCard,
  MapPin,
  GitBranch,
  Calculator,
  UploadCloud,
  Zap,
} from 'lucide-react'

/* ----------------------------------------------------------------
   Navigation structure — grouped into sections
   ---------------------------------------------------------------- */
interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  adminOnly?: boolean
  adminOptional?: boolean
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Core',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/opportunities', icon: Search, label: 'Opportunities' },
      { to: '/clients', icon: Users, label: 'Clients' },
      { to: '/decisions', icon: Scale, label: 'Bid Decisions' },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { to: '/submissions', icon: FileText, label: 'Submissions' },
      { to: '/subcontracting', icon: GitBranch, label: 'Subcontracting' },
      { to: '/state-municipal', icon: MapPin, label: 'State & Municipal' },
      { to: '/penalties', icon: DollarSign, label: 'Penalties' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/roi-calculator', icon: Calculator, label: 'ROI Calculator' },
      { to: '/rewards', icon: Gift, label: 'Rewards' },
    ],
  },
  {
    label: 'Resources',
    items: [
      { to: '/templates', icon: FileText, label: 'Templates' },
      { to: '/template-library', icon: BookMarked, label: 'Template Library' },
      { to: '/doc-requirements', icon: ClipboardList, label: 'Doc Requirements' },
      { to: '/contract-upload', icon: UploadCloud, label: 'Upload Contract' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/billing', icon: CreditCard, label: 'Billing', adminOptional: true },
      { to: '/compliance', icon: ShieldCheck, label: 'Compliance', adminOnly: true },
      { to: '/settings', icon: Settings, label: 'Settings', adminOnly: true },
    ],
  },
]

export function Layout() {
  const { pathname } = useLocation()
  const { user, firm, logout } = useAuth()
  const { items: recentItems, clearHistory } = useRecentlyViewed()
  const { favorites, removeFavorite } = useFavorites()

  const [recentOpen, setRecentOpen] = useState(true)
  const [favOpen, setFavOpen] = useState(true)

  const fmtDeadline = (d?: string) => {
    if (!d) return null
    const days = Math.round((new Date(d).getTime() - Date.now()) / 86400000)
    if (days < 0) return null
    return days <= 7 ? (
      <span className="text-red-400 text-[9px] font-mono font-bold">{days}d</span>
    ) : days <= 20 ? (
      <span className="text-amber-400 text-[9px] font-mono font-bold">{days}d</span>
    ) : (
      <span className="text-slate-600 text-[9px] font-mono">{days}d</span>
    )
  }

  const isActive = (to: string) =>
    to === '/' ? pathname === '/' : pathname.startsWith(to)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#040d1a' }}>

      {/* ============================================================
          SIDEBAR
          ============================================================ */}
      <aside
        className="w-60 flex-shrink-0 flex flex-col overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg, #050e1e 0%, #071120 40%, #060f1c 100%)',
          borderRight: '1px solid rgba(26,46,74,0.7)',
        }}
      >
        {/* ---- Brand ---- */}
        <div
          className="px-4 pt-5 pb-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(26,46,74,0.6)' }}
        >
          {/* Logo row */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex-shrink-0 animate-float">
              <svg width="34" height="34" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="sbCanopy" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24"/>
                    <stop offset="100%" stopColor="#f59e0b"/>
                  </linearGradient>
                  <filter id="logoGlow">
                    <feGaussianBlur stdDeviation="1.5" result="blur"/>
                    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>
                <path d="M32 7 C15 7 3 19 3 33 L61 33 C61 19 49 7 32 7Z" fill="url(#sbCanopy)" filter="url(#logoGlow)"/>
                <line x1="32" y1="7"  x2="32" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4"/>
                <line x1="20" y1="9.5" x2="22" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4"/>
                <line x1="44" y1="9.5" x2="42" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4"/>
                <line x1="10" y1="17" x2="14" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4"/>
                <line x1="54" y1="17" x2="50" y2="33" stroke="#92400e" strokeWidth="0.7" opacity="0.4"/>
                <line x1="32" y1="33" x2="32" y2="54" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"/>
                <path d="M32 54 Q32 61 25 61 Q20 61 20 55.5" stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p
                className="text-sm font-black tracking-widest leading-none"
                style={{
                  background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '0.08em',
                }}
              >
                MR GOVCON
              </p>
              <p className="text-[9px] text-slate-600 tracking-[0.15em] uppercase mt-0.5">
                GovCon Advisory Intelligence
              </p>
            </div>
          </div>

          {/* Veteran badge + live indicator */}
          <div className="flex items-center justify-between">
            <span className="veteran-badge">★ Veteran Owned</span>
            <div className="flex items-center gap-1.5">
              <div className="live-dot" />
              <span className="text-[9px] text-emerald-600 font-medium tracking-wide">LIVE</span>
            </div>
          </div>

          {/* User info */}
          <div
            className="mt-3 pt-3"
            style={{ borderTop: '1px solid rgba(26,46,74,0.5)' }}
          >
            <p className="text-[13px] font-semibold text-slate-100 truncate leading-tight">
              {firm?.name}
            </p>
            <p className="text-[11px] text-slate-600 truncate mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide"
                style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.22)',
                  color: '#f59e0b',
                  letterSpacing: '0.06em',
                }}
              >
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* ---- Navigation ---- */}
        <nav className="px-2 py-2 flex-shrink-0">
          {navSections.map((section) => {
            const visibleItems = section.items.filter((item) => {
              if (item.adminOnly && user?.role !== 'ADMIN') return false
              return true
            })
            if (visibleItems.length === 0) return null

            return (
              <div key={section.label}>
                <p className="nav-section-label">{section.label}</p>
                {visibleItems.map((item) => {
                  const active = isActive(item.to)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`nav-item${active ? ' active' : ''}`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" strokeWidth={active ? 2 : 1.75} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* ---- Divider ---- */}
        <div className="mx-3">
          <div className="divider-gold" style={{ margin: '0.25rem 0' }} />
        </div>

        {/* ---- Favorites ---- */}
        <div className="flex-shrink-0 px-2">
          <button
            onClick={() => setFavOpen((o) => !o)}
            className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors rounded-md hover:bg-white/5"
            style={{ color: 'rgba(251,191,36,0.6)' }}
          >
            <div className="flex items-center gap-1.5">
              <Star className="w-3 h-3" fill="currentColor" />
              <span>Pinned</span>
              {favorites.length > 0 && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: 'rgba(245,158,11,0.15)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245,158,11,0.25)',
                  }}
                >
                  {favorites.length}
                </span>
              )}
            </div>
            {favOpen
              ? <ChevronDown className="w-3 h-3 opacity-50" />
              : <ChevronRight className="w-3 h-3 opacity-50" />
            }
          </button>

          {favOpen && (
            <div className="pb-1 space-y-px">
              {favorites.length === 0 ? (
                <p className="text-[10px] text-slate-700 px-3 py-1 italic">
                  Star any contract to pin it here
                </p>
              ) : (
                favorites.map((fav) => (
                  <div key={fav.id} className="group flex items-center gap-1">
                    <Link
                      to={`/opportunities/${fav.id}`}
                      className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-slate-500 hover:text-amber-300 hover:bg-white/5 transition-all"
                    >
                      <Star className="w-2.5 h-2.5 text-amber-500/60 flex-shrink-0" fill="currentColor" />
                      <span className="truncate">{fav.title}</span>
                      {fmtDeadline(fav.deadline)}
                    </Link>
                    <button
                      onClick={() => removeFavorite(fav.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-700 hover:text-red-400 transition-all flex-shrink-0"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ---- Recently Viewed ---- */}
        <div className="flex-shrink-0 px-2">
          <button
            onClick={() => setRecentOpen((o) => !o)}
            className="flex items-center justify-between w-full px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors rounded-md hover:bg-white/5"
            style={{ color: 'rgba(34,211,238,0.5)' }}
          >
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>Recent</span>
            </div>
            {recentOpen
              ? <ChevronDown className="w-3 h-3 opacity-50" />
              : <ChevronRight className="w-3 h-3 opacity-50" />
            }
          </button>

          {recentOpen && (
            <div className="pb-1 space-y-px">
              {recentItems.length === 0 ? (
                <p className="text-[10px] text-slate-700 px-3 py-1 italic">No contracts viewed yet</p>
              ) : (
                <>
                  {recentItems.map((item) => (
                    <Link
                      key={item.id}
                      to={`/opportunities/${item.id}`}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-slate-600 hover:text-slate-200 hover:bg-white/5 transition-all"
                    >
                      <Clock className="w-2.5 h-2.5 flex-shrink-0 text-cyan-900" />
                      <span className="truncate flex-1">{item.title}</span>
                      {fmtDeadline(item.deadline)}
                    </Link>
                  ))}
                  <button
                    onClick={clearHistory}
                    className="text-[10px] text-slate-700 hover:text-slate-500 px-3 pt-1 transition-colors"
                  >
                    Clear history
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ---- Spacer ---- */}
        <div className="flex-1" />

        {/* ---- Footer actions ---- */}
        <div
          className="px-2 py-2.5 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(26,46,74,0.5)' }}
        >
          <a
            href="/client-login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-600 hover:text-sky-400 w-full rounded-lg hover:bg-white/5 transition-all font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Client Portal
          </a>
          <button
            onClick={logout}
            className="flex items-center gap-2.5 px-3 py-2 text-[11px] text-slate-600 hover:text-red-400 w-full rounded-lg hover:bg-white/5 transition-all font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ============================================================
          MAIN CONTENT
          ============================================================ */}
      <main className="flex-1 overflow-auto" style={{ background: '#040d1a' }}>
        {/* Subtle dot grid background */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(26,46,74,0.35) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            zIndex: 0,
          }}
        />

        {/* Content */}
        <div className="relative z-10 p-8 max-w-[1400px] mx-auto">
          <Outlet />
        </div>

        {/* Brand footer */}
        <div
          className="relative z-10 px-8 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(26,46,74,0.4)' }}
        >
          <p className="text-[10px] text-slate-800 tracking-widest">
            © {new Date().getFullYear()} MERCY RAINE LLC · Veteran Owned & Operated
          </p>
          <div className="flex items-center gap-1.5">
            <Zap className="w-2.5 h-2.5 text-amber-800" />
            <p className="text-[10px] text-slate-800">Mr GovCon — Advisory Intelligence</p>
          </div>
        </div>
      </main>
    </div>
  )
}
