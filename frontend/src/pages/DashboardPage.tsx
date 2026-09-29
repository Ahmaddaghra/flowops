import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from 'react-router-dom';
import { LayoutDashboard, ArrowRight } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Executive operational metrics, workflow cycle times, and throughput analytics."
      />
      <EmptyState
        icon={<LayoutDashboard className="h-6 w-6 text-indigo-500" />}
        title="Operational Dashboard (Phase 5)"
        description="Executive charts, queue throughput metrics, and audit summary cards will be integrated in Phase 5."
        action={
          <Link
            to="/work-items"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-transparent bg-slate-900 px-3 text-xs font-medium text-white shadow-sm transition-colors duration-150 hover:bg-slate-800 active:bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:ring-offset-2 select-none"
          >
            Go to Work Items
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />
    </div>
  );
};
