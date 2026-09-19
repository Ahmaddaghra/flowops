import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { CheckSquare, LayoutDashboard, Settings, X, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Work Items', href: '/work-items', icon: CheckSquare },
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, badge: 'Phase 5' },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const MobileNav: React.FC<MobileNavProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="relative flex flex-col w-72 max-w-[80vw] bg-slate-900 border-r border-slate-800 text-slate-300 z-10 animate-in slide-in-from-left duration-200 shadow-2xl">
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Layers className="h-4 w-4" />
            </div>
            <span className="font-bold text-base text-white">FlowOps</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav
          className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto"
          aria-label="Mobile Navigation"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                )
              }
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5" />
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
      </div>
    </div>
  );
};
