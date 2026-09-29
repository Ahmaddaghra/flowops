import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckSquare,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navigation: NavItem[] = [
  { name: 'Work Items', href: '/work-items', icon: CheckSquare },
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, badge: 'Phase 5' },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 border-r border-slate-800 text-slate-300">
      {/* Brand Header */}
      <div className="flex items-center h-16 px-6 border-b border-slate-800/80 gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
          <Layers className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base tracking-tight text-white">FlowOps</span>
          <span className="text-[11px] font-medium text-slate-400">Operations Suite</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto"
        aria-label="Main Navigation"
      >
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150',
                isActive
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              )
            }
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-200" />
              <span>{item.name}</span>
            </div>
            {item.badge && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-800 text-slate-400 border border-slate-700">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-2.5 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex flex-col">
            <span className="font-medium text-slate-300">Phase 2 Foundation</span>
            <span className="text-[10px] text-slate-500">ASP.NET 10 + React 19</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
