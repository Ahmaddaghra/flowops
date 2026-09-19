import React from 'react';
import { Menu, Activity } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface HeaderProps {
  onOpenMobileNav: () => void;
  isBackendHealthy: boolean | null;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileNav, isBackendHealthy }) => {
  const location = useLocation();

  const getBreadcrumb = () => {
    if (location.pathname.startsWith('/work-items/')) return 'Work Items / Detail';
    if (location.pathname === '/work-items') return 'Work Items';
    if (location.pathname === '/settings') return 'Settings';
    if (location.pathname === '/dashboard') return 'Dashboard';
    return 'Operations';
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur-xs px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open sidebar"
          className="lg:hidden -ml-1.5 p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-slate-500">{getBreadcrumb()}</span>
      </div>

      <div className="flex items-center gap-4">
        {/* API Health indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-full">
          <Activity className="h-3.5 w-3.5 text-slate-400" />
          <span>API:</span>
          {isBackendHealthy === null ? (
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-300 animate-pulse" />
              Connecting
            </span>
          ) : isBackendHealthy ? (
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Healthy
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-rose-700 font-medium">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              Unavailable
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
