import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { WorkItemPriority } from '@/types/workItems';

interface WorkItemPriorityBadgeProps {
  priority: WorkItemPriority;
  className?: string;
}

const priorityConfig: Record<
  WorkItemPriority,
  { label: string; variant: 'neutral' | 'info' | 'warning' | 'danger' }
> = {
  Low: { label: 'Low', variant: 'neutral' },
  Medium: { label: 'Medium', variant: 'info' },
  High: { label: 'High', variant: 'warning' },
  Critical: { label: 'Critical', variant: 'danger' },
};

export const WorkItemPriorityBadge: React.FC<WorkItemPriorityBadgeProps> = ({
  priority,
  className,
}) => {
  const config = priorityConfig[priority] || { label: priority, variant: 'neutral' };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
};
