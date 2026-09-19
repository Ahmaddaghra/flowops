import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { workItemsApi } from '@/lib/api/workItems';
import { WorkItem } from '@/types/workItems';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { WorkItemStatusBadge } from '../components/WorkItemStatusBadge';
import { WorkItemPriorityBadge } from '../components/WorkItemPriorityBadge';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, User, Calendar, Clock, Hash, Copy, Check } from 'lucide-react';
import { ApiError } from '@/types/api';

export const WorkItemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    try {
      const data = await workItemsApi.getById(id);
      setItem(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError(`Work item with ID '${id}' was not found.`);
        } else {
          setError(
            err.problemDetails?.detail ||
              err.message ||
              'Failed to load work item detail.'
          );
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while loading work item.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleCopyId = () => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
        </div>
        <Card className="p-6 space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <div className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-32 pt-4" />
        </Card>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-6">
        <Link
          to="/work-items"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Work Items
        </Link>
        <ErrorState
          title="Work Item Not Found"
          message={error || 'The requested work item could not be retrieved.'}
          onRetry={fetchDetail}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/work-items"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Work Items
        </Link>
        <button
          onClick={handleCopyId}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded px-2.5 py-1 transition-colors"
          title="Copy full UUID"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-600">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy ID</span>
            </>
          )}
        </button>
      </div>

      <PageHeader
        title={item.title}
        badge={
          <div className="flex items-center gap-2">
            <WorkItemPriorityBadge priority={item.priority} />
            <WorkItemStatusBadge status={item.status} />
          </div>
        }
      />

      {/* Metadata Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Hash className="h-3.5 w-3.5 text-slate-400" />
            <span>Identifier</span>
          </div>
          <p
            className="font-mono text-xs text-slate-800 font-medium truncate"
            title={item.id}
          >
            {item.id}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <User className="h-3.5 w-3.5 text-slate-400" />
            <span>Assignee</span>
          </div>
          <p className="text-sm font-medium text-slate-800">
            {item.assigneeName || (
              <span className="text-slate-400 italic font-normal">Unassigned</span>
            )}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span>Created At</span>
          </div>
          <p className="text-sm font-medium text-slate-800">
            {formatDate(item.createdAtUtc)}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>Last Updated</span>
          </div>
          <p className="text-sm font-medium text-slate-800">
            {formatDate(item.updatedAtUtc)}
          </p>
        </Card>
      </div>

      {/* Description / Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-900">
            Description
          </CardTitle>
        </CardHeader>
        <CardContent>
          {item.description ? (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {item.description}
            </p>
          ) : (
            <p className="text-xs text-slate-400 italic">
              No description provided for this work item.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Phase notice */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center justify-between">
        <span>
          Work item status transitions, editing, and history auditing will be enabled in
          Phase 3.
        </span>
        <Link to="/work-items">
          <Button variant="ghost" size="sm">
            View all items
          </Button>
        </Link>
      </div>
    </div>
  );
};
