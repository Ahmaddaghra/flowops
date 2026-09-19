import React from 'react';
import { Link } from 'react-router-dom';
import { WorkItem } from '@/types/workItems';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { WorkItemStatusBadge } from './WorkItemStatusBadge';
import { WorkItemPriorityBadge } from './WorkItemPriorityBadge';
import { formatDate } from '@/lib/utils';
import { User } from 'lucide-react';

interface WorkItemTableProps {
  items: WorkItem[];
}

export const WorkItemTable: React.FC<WorkItemTableProps> = ({ items }) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead className="w-[130px]">Status</TableHead>
          <TableHead className="w-[110px]">Priority</TableHead>
          <TableHead className="w-[160px]">Assignee</TableHead>
          <TableHead className="w-[170px]">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="group">
            <TableCell className="font-mono text-xs text-slate-500">
              <Link
                to={`/work-items/${item.id}`}
                className="hover:text-indigo-600 focus:outline-none focus:underline"
              >
                {item.id.substring(0, 8)}…
              </Link>
            </TableCell>
            <TableCell>
              <Link
                to={`/work-items/${item.id}`}
                className="font-medium text-slate-900 group-hover:text-indigo-600 transition-colors block"
              >
                {item.title}
              </Link>
              {item.description && (
                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5 max-w-lg">
                  {item.description}
                </p>
              )}
            </TableCell>
            <TableCell>
              <WorkItemStatusBadge status={item.status} />
            </TableCell>
            <TableCell>
              <WorkItemPriorityBadge priority={item.priority} />
            </TableCell>
            <TableCell>
              {item.assigneeName ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {item.assigneeName}
                </span>
              ) : (
                <span className="text-xs text-slate-400 italic">Unassigned</span>
              )}
            </TableCell>
            <TableCell className="text-xs text-slate-500">
              {formatDate(item.createdAtUtc)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
