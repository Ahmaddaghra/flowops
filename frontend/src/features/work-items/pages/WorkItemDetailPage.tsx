import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Calendar, Check, Clock, Copy, Hash } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError } from '@/types/api';
import {
  Category,
  CreateWorkItemRequest,
  WorkItem,
  WorkItemActivity,
  WorkItemStatus,
} from '@/types/workItems';
import { categoriesApi, workItemsApi } from '@/lib/api/workItems';
import { formatDate } from '@/lib/utils';
import { WorkItemPriorityBadge } from '../components/WorkItemPriorityBadge';
import { WorkItemStatusBadge } from '../components/WorkItemStatusBadge';
import { WorkItemForm } from '../components/WorkItemForm';

const legalNextStatuses: Record<WorkItemStatus, WorkItemStatus[]> = {
  Todo: ['InProgress', 'Blocked'],
  InProgress: ['Blocked', 'Done'],
  Blocked: ['InProgress', 'Todo'],
  Done: [],
};

const statusLabels: Record<WorkItemStatus, string> = {
  Todo: 'To Do',
  InProgress: 'In Progress',
  Blocked: 'Blocked',
  Done: 'Done',
};

const activityLabels: Record<WorkItemActivity['eventType'], string> = {
  Created: 'Work item created',
  TitleChanged: 'Title updated',
  DescriptionChanged: 'Description updated',
  PriorityChanged: 'Priority updated',
  CategoryChanged: 'Category updated',
  StatusChanged: 'Status changed',
  AssignmentChanged: 'Assignment changed',
};

export const WorkItemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [activity, setActivity] = useState<WorkItemActivity[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isSavingAssignee, setIsSavingAssignee] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!id) {
      setError('A work item ID is required.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await workItemsApi.getById(id);
      setItem(data);
      setAssigneeDraft(data.assigneeName ?? '');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404)
        setError(`Work item '${id}' was not found.`);
      else if (err instanceof Error) setError(err.message);
      else setError('An unexpected error occurred while loading this work item.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchActivity = useCallback(async () => {
    if (!id) return;
    setIsActivityLoading(true);
    setActivityError(null);
    try {
      setActivity(await workItemsApi.getActivity(id));
    } catch (err: unknown) {
      setActivityError(
        err instanceof Error ? err.message : 'Could not load work item activity.'
      );
    } finally {
      setIsActivityLoading(false);
    }
  }, [id]);

  const fetchCategories = useCallback(async () => {
    setCategoriesError(null);
    try {
      setCategories(await categoriesApi.list());
    } catch (err: unknown) {
      setCategoriesError(
        err instanceof Error ? err.message : 'Could not load categories.'
      );
    }
  }, []);

  useEffect(() => {
    void fetchDetail();
    void fetchActivity();
    void fetchCategories();
  }, [fetchActivity, fetchCategories, fetchDetail]);

  const handleCopyId = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleChangeStatus = async (nextStatus: WorkItemStatus) => {
    if (!id) return;
    if (
      nextStatus === 'Done' &&
      !window.confirm('Mark this work item as Done? This status cannot be changed later.')
    )
      return;

    setStatusError(null);
    setIsChangingStatus(true);
    try {
      setItem(await workItemsApi.changeStatus(id, nextStatus));
      await fetchActivity();
    } catch (err: unknown) {
      setStatusError(
        err instanceof ApiError && err.status === 409
          ? 'The server rejected this status change. Refresh the item and try an allowed transition.'
          : err instanceof Error
            ? err.message
            : 'Could not change the work item status.'
      );
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleAssign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id) return;
    setAssignmentError(null);
    setIsSavingAssignee(true);
    try {
      setItem(await workItemsApi.assign(id, assigneeDraft.trim() || null));
      await fetchActivity();
    } catch (err: unknown) {
      setAssignmentError(
        err instanceof Error ? err.message : 'Could not update the assignment.'
      );
    } finally {
      setIsSavingAssignee(false);
    }
  };

  const handleUnassign = async () => {
    if (!id) return;
    setAssignmentError(null);
    setIsSavingAssignee(true);
    try {
      const updated = await workItemsApi.assign(id, null);
      setItem(updated);
      setAssigneeDraft('');
      await fetchActivity();
    } catch (err: unknown) {
      setAssignmentError(
        err instanceof Error ? err.message : 'Could not unassign this work item.'
      );
    } finally {
      setIsSavingAssignee(false);
    }
  };

  const handleEdit = async (request: CreateWorkItemRequest) => {
    if (!id) return;
    const updated = await workItemsApi.update(id, {
      title: request.title,
      description: request.description,
      priority: request.priority,
      categoryId: request.categoryId,
    });
    setItem(updated);
    setIsEditing(false);
    await fetchActivity();
  };

  if (isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading work item">
        <Skeleton className="h-8 w-32" />
        <Card className="p-6 space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
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
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Work Items
        </Link>
        <ErrorState
          title="Could not load work item"
          message={error || 'The requested work item could not be retrieved.'}
          onRetry={() => void fetchDetail()}
        />
      </div>
    );
  }

  const nextStatuses = legalNextStatuses[item.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/work-items"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Work Items
        </Link>
        <Button variant="outline" size="sm" onClick={() => void handleCopyId()}>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy ID'}
        </Button>
      </div>

      <PageHeader
        title={item.title}
        badge={
          <div className="flex items-center gap-2">
            <WorkItemPriorityBadge priority={item.priority} />
            <WorkItemStatusBadge status={item.status} />
          </div>
        }
        action={
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            Edit details
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <Hash className="h-3.5 w-3.5" aria-hidden="true" />
            Identifier
          </div>
          <p className="truncate font-mono text-xs text-slate-800" title={item.id}>
            {item.id}
          </p>
        </Card>
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Category
          </div>
          <p className="text-sm font-medium text-slate-800">
            {item.categoryName || 'No category'}
          </p>
        </Card>
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Created
          </div>
          <p className="text-sm font-medium text-slate-800">
            {formatDate(item.createdAtUtc)}
          </p>
        </Card>
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Last updated
          </div>
          <p className="text-sm font-medium text-slate-800">
            {formatDate(item.updatedAtUtc)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {item.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {item.description}
                </p>
              ) : (
                <p className="text-sm italic text-slate-400">
                  No description provided for this work item.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity history</CardTitle>
            </CardHeader>
            <CardContent>
              {isActivityLoading && (
                <p className="text-sm text-slate-500" role="status">
                  Loading activity…
                </p>
              )}
              {!isActivityLoading && activityError && (
                <ErrorState
                  title="Could not load activity"
                  message={activityError}
                  onRetry={() => void fetchActivity()}
                />
              )}
              {!isActivityLoading && !activityError && activity.length === 0 && (
                <p className="text-sm text-slate-500">
                  No activity has been recorded yet.
                </p>
              )}
              {!isActivityLoading && !activityError && activity.length > 0 && (
                <ol className="space-y-4" aria-label="Work item activity, newest first">
                  {activity.map((event) => (
                    <li
                      key={event.id}
                      className="flex gap-3 border-l-2 border-slate-200 pl-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">
                          {event.description}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {activityLabels[event.eventType]} ·{' '}
                          {event.actorUserId ?? 'System'} ·{' '}
                          {formatDate(event.createdAtUtc)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                Current status:{' '}
                <span className="font-medium text-slate-900">
                  {statusLabels[item.status]}
                </span>
              </p>
              {statusError && (
                <p className="text-sm text-rose-700" role="alert">
                  {statusError}
                </p>
              )}
              {nextStatuses.length > 0 ? (
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Allowed next statuses"
                >
                  {nextStatuses.map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      onClick={() => void handleChangeStatus(status)}
                      disabled={isChangingStatus}
                      isLoading={isChangingStatus}
                    >
                      {status === 'Done'
                        ? 'Mark Done'
                        : `Move to ${statusLabels[status]}`}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Done items are final and have no next status.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleAssign}>
                <p className="text-xs text-slate-500">
                  Pre-auth assignment uses a display name. User accounts are part of Phase
                  4.
                </p>
                <Input
                  label="Assignee name"
                  value={assigneeDraft}
                  onChange={(event) => setAssigneeDraft(event.target.value)}
                  maxLength={100}
                  hint={
                    item.assigneeName
                      ? `Currently assigned to ${item.assigneeName}`
                      : 'Leave empty to keep this item unassigned.'
                  }
                />
                {assignmentError && (
                  <p className="text-sm text-rose-700" role="alert">
                    {assignmentError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={isSavingAssignee}
                    disabled={
                      isSavingAssignee ||
                      assigneeDraft.trim() === (item.assigneeName ?? '')
                    }
                  >
                    Save assignment
                  </Button>
                  {item.assigneeName && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleUnassign()}
                      disabled={isSavingAssignee}
                    >
                      Unassign
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit work item details"
        description="Status changes are handled separately in the workflow controls."
        className="max-h-[90vh] overflow-y-auto"
      >
        {categoriesError && (
          <div
            className="mb-4 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            role="alert"
          >
            <span>{categoriesError}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void fetchCategories()}
            >
              Retry
            </Button>
          </div>
        )}
        <WorkItemForm
          categories={categories}
          initialValues={{
            title: item.title,
            description: item.description,
            priority: item.priority,
            categoryId: item.categoryId,
          }}
          submitLabel="Save changes"
          onCancel={() => setIsEditing(false)}
          onSubmit={handleEdit}
        />
      </Modal>
    </div>
  );
};
