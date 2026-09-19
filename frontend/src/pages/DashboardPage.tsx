import React from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
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
          <Link to="/work-items">
            <Button
              variant="primary"
              size="sm"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Go to Work Items
            </Button>
          </Link>
        }
      />
    </div>
  );
};
