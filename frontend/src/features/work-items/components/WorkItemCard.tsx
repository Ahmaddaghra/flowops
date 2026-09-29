import React from 'react';
import { Link } from 'react-router-dom';
import { WorkItem } from '@/types/workItems';
import { Card } from '@/components/ui/Card';
import { WorkItemStatusBadge } from './WorkItemStatusBadge';
import { WorkItemPriorityBadge } from './WorkItemPriorityBadge';
import { formatDate } from '@/lib/utils';
import { User, Clock } from 'lucide-react';

interface WorkItemCardProps {
  item: WorkItem;
}

export const WorkItemCard: React.FC<WorkItemCardProps> = ({ item }) => {
  return (
    <Card hoverable className="p-4">
      <Link to={`/work-items/${item.id}`} className="block focus:outline-none">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="font-mono text-xs text-slate-400">
            {item.id.substring(0, 8)}…
          </span>
          <div className="flex items-center gap-1.5">
            <WorkItemPriorityBadge priority={item.priority} />
            <WorkItemStatusBadge status={item.status} />
          </div>
        </div>
        <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 mb-1.5 hover:text-indigo-600 transition-colors">
          {item.title}
        </h3>
        {item.description && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-3">{item.description}</p>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-slate-400" />
            <span>{item.assigneeName || 'Unassigned'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>{formatDate(item.createdAtUtc)}</span>
          </div>
        </div>
      </Link>
    </Card>
  );
};
