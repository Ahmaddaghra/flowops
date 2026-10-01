import type { WorkItem } from '@/types/workItems';
import { cn } from '@/lib/utils';

interface WorkItemAssigneeProps {
  item: Pick<WorkItem, 'assigneeUserId' | 'assignee' | 'legacyAssigneeName'>;
  className?: string;
}

export const WorkItemAssignee = ({ item, className }: WorkItemAssigneeProps) => {
  const label = item.assigneeUserId
    ? item.assignee?.displayName?.trim() || 'Assigned user unavailable'
    : item.legacyAssigneeName?.trim()
      ? `Historical assignment: ${item.legacyAssigneeName}`
      : 'Unassigned';

  return <span className={cn('break-words', className)}>{label}</span>;
};
