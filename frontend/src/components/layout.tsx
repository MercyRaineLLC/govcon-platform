import { useState } from 'react'
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
  Shield,
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
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/opportunities', icon: Search, label: 'Opportunities' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/decisions', icon: Scale, label: 'Decisions' },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/doc-requirements', icon: ClipboardList, label: 'Doc Requirements' },
  { to: '/submissions', icon: FileText, label: 'Submissions' },
  { to: '/penalties', icon: DollarSign, label: 'Penalties' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/rewards', icon: Gift, label: 'Rewards' },
  { to: '/template-library', icon: BookMarked, label: 'Template Library' },
  { to: '/billing', icon: CreditCard, label: 'Billing' },
  { to: '/compliance', icon: ShieldCheck, label: 'Compliance', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings', adminOnly: true },
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
      <span className="text-red-400 text-[9px]">{days}d</span>
    ) : days <= 20 ? (
      <span className="text-yellow-400 text-[9px]">{days}d</span>
    ) : (
      <span className="text-gray-600 text-[9px]">{days}d</span>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#040d1a' }}>
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col overflow-y-auto"
        style={{
          background: 'linear-gradient(180deg, #071120 0%, #0b1628 60%, #081422 100%)',
          borderRight: '1px solid rgba(245,158,11,0.12)',
        }}>

        {/* Brand mark */}
        <div className="px-5 pt-5 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
          {/* Logo row */}
          <div className="flex items-center gap-3 mb-3">
            {/* Umbrella icon */}
            <div className="flex-shrink-0">
              <svg width="36" height="36" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="sbCanopy" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24"/>
                    <stop offset="100%" stopColor="#f59e0b"/>
                  </linearGradient>
                </defs>
                <path d="M32 7 C15 7 3 19 3 33 L61 33 C61 19 49 7 32 7Z" fill="url(#sbCanopy)"/>
                <line x1="32" y1="7"  x2="32" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35"/>
                <line x1="20" y1="9.5" x2="22" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35"/>
                <line x1="44" y1="9.5" x2="42" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35"/>
                <line x1="10" y1="17" x2="14" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35"/>
                <line x1="54" y1="17" x2="50" y2="33" stroke="#92400e" strokeWidth="0.8" opacity="0.35"/>
                <line x1="32" y1="33" x2="32" y2="54" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"/>
                <path d="M32 54 Q32 61 25 61 Q20 61 20 55.5" stroke="#f59e0b" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight" style={{
                background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '0.04em',
              }}>
                MERCY RAINE
              </p>
              <p className="text-[10px] text-slate-500 tracking-widest">Advisory Intelligence</p>
            </div>
          </div>

          {/* SDVOSB badge */}
          <div className="mb-3">
            <span className="veteran-badge">★ SDVOSB · Veteran-Owned</span>
          </div>

          {/* User info */}
          <div style={{ borderTop: '1px solid rgba(245,158,11,0.08)', paddingTop: '0.625rem' }}>
            <p className="text-sm font-semibold text-slate-100 truncate">{firm?.name}</p>
            <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide" style={{
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.25)',
                color: '#f59e0b',
              }}>
                {user?.role}
              </span>
              <button
                onClick={logout}
                title="Sign Out"
                className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="px-3 py-3 space-y-0.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(245,158,11,0.07)' }}>
          {navItems.map((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return null
            const active = pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to))
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active ? 'text-amber-300' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`}
                style={active ? {
                  background: 'linear-gradient(90deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.04) 100%)',
                  borderLeft: '2px solid #f59e0b',
                  paddingLeft: '10px',
                } : {}}
              >
                <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-amber-400' : ''}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Favorites */}
        <div className="flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button
            onClick={() => setFavOpen((o) => !o)}
            className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold uppercase tracking-widest transition-colors hover:text-yellow-300"
            style={{ color: 'rgba(251,191,36,0.7)' }}
          >
            <div className="flex items-center gap-1.5">
              <Star className="w-3 h-3" fill="currentColor" />
              <span>Favorites</span>
              {favorites.length > 0 && (
                <span className="ml-1 text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
                  {favorites.length}
                </span>
              )}
            </div>
            {favOpen ? <ChevronDown className="w-3 h-3 opacity-60" /> : <ChevronRight className="w-3 h-3 opacity-60" />}
          </button>
          {favOpen && (
            <div className="px-3 pb-2.5 space-y-0.5">
              {favorites.length === 0 ? (
                <p className="text-[11px] text-slate-600 px-2 py-1 italic">Star any contract to pin it here</p>
              ) : (
                favorites.map((fav) => (
                  <div key={fav.id} className="group flex items-center gap-1">
                    <Link
                      to={`/opportunities/${fav.id}`}
                      className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-slate-400 hover:text-yellow-300 hover:bg-white/5 transition-all"
                    >
                      <Star className="w-2.5 h-2.5 text-yellow-500 flex-shrink-0" fill="currentColor" />
                      <span className="truncate">{fav.title}</span>
                      {fmtDeadline(fav.deadline)}
                    </Link>
                    <button
                      onClick={() => removeFavorite(fav.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Recently Viewed */}
        <div className="flex-shrink-0">
          <button
            onClick={() => setRecentOpen((o) => !o)}
            className="flex items-center justify-between w-full px-4 py-2 text-[11px] font-semibold uppercase tracking-widest transition-colors hover:text-cyan-300"
            style={{ color: 'rgba(34,211,238,0.6)' }}
          >
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>Recent</span>
            </div>
            {recentOpen ? <ChevronDown className="w-3 h-3 opacity-60" /> : <ChevronRight className="w-3 h-3 opacity-60" />}
          </button>
          {recentOpen && (
            <div className="px-3 pb-2.5 space-y-0.5">
              {recentItems.length === 0 ? (
                <p className="text-[11px] text-slate-600 px-2 py-1 italic">No contracts viewed yet</p>
              ) : (
                <>
                  {recentItems.map((item) => (
                    <Link
                      key={item.id}
                      to={`/opportunities/${item.id}`}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-slate-500 hover:text-slate-100 hover:bg-white/5 transition-all"
                    >
                      <Clock className="w-2.5 h-2.5 flex-shrink-0 text-cyan-800" />
                      <span className="truncate flex-1">{item.title}</span>
                      {fmtDeadline(item.deadline)}
                    </Link>
                  ))}
                  <button
                    onClick={clearHistory}
                    className="text-[10px] text-slate-700 hover:text-slate-500 px-2 pt-1 transition-colors"
                  >
                    Clear history
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Client Portal + Sign Out */}
        <div className="px-3 py-3 space-y-0.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(245,158,11,0.1)' }}>
          <a
            href="/client-login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 text-xs text-slate-500 hover:text-blue-400 w-full rounded-lg hover:bg-white/5 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Client Portal
          </a>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500 hover:text-red-400 w-full rounded-lg hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto" style={{ background: '#040d1a' }}>
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
        {/* Brand footer strip */}
        <div className="px-8 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(245,158,11,0.08)' }}>
          <p className="text-[10px] text-slate-700 tracking-widest">
            © {new Date().getFullYear()} MERCY RAINE LLC · SDVOSB · All Rights Reserved
          </p>
          <p className="text-[10px] text-slate-700">GovCon Advisory Intelligence Platform</p>
        </div>
      </main>
    </div>
  )
}
