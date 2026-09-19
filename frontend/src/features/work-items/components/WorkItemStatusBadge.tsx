import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { WorkItemStatus } from '@/types/workItems';

interface WorkItemStatusBadgeProps {
  status: WorkItemStatus;
  className?: string;
}

const statusConfig: Record<
  WorkItemStatus,
  { label: string; variant: 'neutral' | 'info' | 'warning' | 'danger' | 'success' }
> = {
  Todo: { label: 'To Do', variant: 'neutral' },
  InProgress: { label: 'In Progress', variant: 'info' },
  Blocked: { label: 'Blocked', variant: 'danger' },
  Done: { label: 'Done', variant: 'success' },
};

export const WorkItemStatusBadge: React.FC<WorkItemStatusBadgeProps> = ({
  status,
  className,
}) => {
  const config = statusConfig[status] || { label: status, variant: 'neutral' };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
};
