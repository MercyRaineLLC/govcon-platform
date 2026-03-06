import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { OnboardingWizard } from './OnboardingWizard';
import { useAuth } from '../hooks/useAuth';
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
  MapPin,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/opportunities', icon: Search, label: 'Opportunities' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/decisions', icon: Scale, label: 'Decisions' },
  { to: '/doc-requirements', icon: ClipboardList, label: 'Doc Requirements' },
  { to: '/submissions', icon: FileText, label: 'Submissions' },
  { to: '/penalties', icon: DollarSign, label: 'Penalties' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/compliance', icon: ShieldCheck,
  MapPin, label: 'Compliance', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings', adminOnly: true },
];

export function Layout() {
  const { pathname } = useLocation();
  const { user, firm, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Brand */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-400" />
            <div>
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">GovCon</p>
              <p className="text-xs text-gray-500">Advisory Intelligence</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-200 truncate">{firm?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-blue-900 text-blue-300">
              {user?.role}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return null;
            const active = pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Client Portal link */}
        <div className="px-4 pb-2">
          <a
            href="/client-login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 hover:text-blue-400 w-full rounded-md hover:bg-gray-800 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Client Portal
          </a>
        </div>

        {/* Logout */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:text-red-400 w-full rounded-md hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}