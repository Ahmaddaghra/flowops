import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Calendar, Check, Clock, Copy, Hash } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
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
import { WorkItemAssignment } from '../components/WorkItemAssignment';
import { WorkItemComments } from '../components/WorkItemComments';
import { workItemMutationErrorMessage } from '../utils/mutationErrorMessage';

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
  CommentAdded: 'Comment added',
};

export const WorkItemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const detailRequestSequence = useRef(0);
  const detailItemId = useRef(id);
  const activityRequestSequence = useRef(0);
  const activityItemId = useRef(id);
  const mutationRouteSequence = useRef(0);
  const pendingMutation = useRef<number | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const [mutationKind, setMutationKind] = useState<
    'assignment' | 'status' | 'edit' | null
  >(null);
  const [itemResult, setItemResult] = useState<{
    workItemId: string;
    item: WorkItem;
  } | null>(null);
  const [activityResult, setActivityResult] = useState<{
    workItemId: string;
    events: WorkItemActivity[];
    error?: string;
  } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<{
    workItemId: string | undefined;
    requestId: number;
    message: string;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeEdit = useCallback(() => setEditingItem(null), []);

  useLayoutEffect(() => {
    detailItemId.current = id;
    detailRequestSequence.current++;
    activityItemId.current = id;
    activityRequestSequence.current++;
    mutationRouteSequence.current++;
    pendingMutation.current = null;
    setMutationKind(null);
    setIsChangingStatus(false);
    setStatusError(null);
    setEditingItem(null);
    const requestCounters = {
      detail: detailRequestSequence,
      activity: activityRequestSequence,
      mutation: mutationRouteSequence,
    };
    return () => {
      requestCounters.detail.current++;
      requestCounters.activity.current++;
      requestCounters.mutation.current++;
      pendingMutation.current = null;
    };
  }, [id]);

  const fetchDetail = useCallback(async () => {
    const requestId = ++detailRequestSequence.current;
    if (!id) {
      setDetailError({
        workItemId: id,
        requestId,
        message: 'A work item ID is required.',
      });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setDetailError(null);
    try {
      const data = await workItemsApi.getById(id);
      if (requestId === detailRequestSequence.current && detailItemId.current === id) {
        setItemResult({ workItemId: id, item: data });
      }
    } catch (err: unknown) {
      if (requestId === detailRequestSequence.current && detailItemId.current === id) {
        let message: string;
        if (err instanceof ApiError && err.status === 404)
          message = `Work item '${id}' was not found.`;
        else if (err instanceof Error) message = err.message;
        else message = 'An unexpected error occurred while loading this work item.';
        setDetailError({ workItemId: id, requestId, message });
      }
    } finally {
      if (requestId === detailRequestSequence.current && detailItemId.current === id)
        setIsLoading(false);
    }
  }, [id]);

  const fetchActivity = useCallback(async () => {
    if (!id || activityItemId.current !== id) return;
    const requestId = ++activityRequestSequence.current;
    setIsActivityLoading(true);
    try {
      const events = await workItemsApi.getActivity(id);
      if (requestId === activityRequestSequence.current && activityItemId.current === id)
        setActivityResult({ workItemId: id, events });
    } catch (err: unknown) {
      if (requestId === activityRequestSequence.current && activityItemId.current === id)
        setActivityResult({
          workItemId: id,
          events: [],
          error:
            err instanceof Error ? err.message : 'Could not load work item activity.',
        });
    } finally {
      if (requestId === activityRequestSequence.current && activityItemId.current === id)
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

  const item = itemResult && itemResult.workItemId === id ? itemResult.item : null;
  const currentDetailError =
    detailError &&
    detailError.workItemId === id &&
    detailError.requestId === detailRequestSequence.current
      ? detailError.message
      : null;
  const isCurrentDetailLoading = isLoading || (!item && currentDetailError === null);
  const currentActivityResult = activityResult?.workItemId === id ? activityResult : null;
  const isCurrentActivityLoading = isActivityLoading || currentActivityResult === null;

  const updateCurrentItem = (nextItem: WorkItem) => {
    if (!id || detailItemId.current !== id) return;
    setItemResult({ workItemId: id, item: nextItem });
  };

  const isCurrentMutationRoute = (routeSequence: number) =>
    mutationRouteSequence.current === routeSequence && detailItemId.current === id;

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
    if (!id || !item?.permissions?.canChangeStatus || pendingMutation.current !== null)
      return;
    if (
      nextStatus === 'Done' &&
      !window.confirm('Mark this work item as Done? This status cannot be changed later.')
    )
      return;

    setStatusError(null);
    setIsChangingStatus(true);
    const routeSequence = mutationRouteSequence.current;
    pendingMutation.current = routeSequence;
    setMutationKind('status');
    try {
      const updated = await workItemsApi.changeStatus(id, {
        status: nextStatus,
        expectedVersion: item.version,
      });
      if (isCurrentMutationRoute(routeSequence)) {
        updateCurrentItem(updated);
        await fetchActivity();
      }
    } catch (err: unknown) {
      if (isCurrentMutationRoute(routeSequence))
        setStatusError(
          workItemMutationErrorMessage(err, 'Could not change the work item status.')
        );
    } finally {
      if (isCurrentMutationRoute(routeSequence)) {
        pendingMutation.current = null;
        setMutationKind(null);
        setIsChangingStatus(false);
      }
    }
  };

  const handleEdit = async (request: CreateWorkItemRequest) => {
    if (
      !id ||
      !editingItem ||
      editingItem.id !== id ||
      !item?.permissions?.canEdit ||
      pendingMutation.current !== null
    )
      return;
    const routeSequence = mutationRouteSequence.current;
    pendingMutation.current = routeSequence;
    setMutationKind('edit');
    try {
      const updated = await workItemsApi.update(id, {
        title: request.title,
        description: request.description,
        priority: request.priority,
        categoryId: request.categoryId,
        expectedVersion: editingItem.version,
      });
      if (isCurrentMutationRoute(routeSequence)) {
        updateCurrentItem(updated);
        await fetchActivity();
        if (isCurrentMutationRoute(routeSequence)) setEditingItem(null);
      }
    } finally {
      if (isCurrentMutationRoute(routeSequence)) {
        pendingMutation.current = null;
        setMutationKind(null);
      }
    }
  };

  const handleAssign = async (assigneeUserId: string | null) => {
    if (!id || !item?.permissions?.canAssign || pendingMutation.current !== null) return;
    const routeSequence = mutationRouteSequence.current;
    pendingMutation.current = routeSequence;
    setMutationKind('assignment');
    try {
      const updated = await workItemsApi.assign(id, {
        assigneeUserId,
        expectedVersion: item.version,
      });
      if (isCurrentMutationRoute(routeSequence)) {
        updateCurrentItem(updated);
        await fetchActivity();
      }
    } finally {
      if (isCurrentMutationRoute(routeSequence)) {
        pendingMutation.current = null;
        setMutationKind(null);
      }
    }
  };

  const refreshItem = () => {
    if (pendingMutation.current !== null) return;
    setStatusError(null);
    void fetchDetail();
    void fetchActivity();
  };

  if (isCurrentDetailLoading) {
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

  if (currentDetailError || !item) {
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
          message={
            currentDetailError || 'The requested work item could not be retrieved.'
          }
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={mutationKind !== null}
            onClick={refreshItem}
          >
            Refresh work item
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleCopyId()}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy ID'}
          </Button>
        </div>
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
          item.permissions?.canEdit ? (
            <Button
              ref={editButtonRef}
              variant="outline"
              disabled={mutationKind !== null}
              onClick={() => setEditingItem(item)}
            >
              Edit details
            </Button>
          ) : undefined
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
              {isCurrentActivityLoading && (
                <p className="text-sm text-slate-500" role="status">
                  Loading activity…
                </p>
              )}
              {!isCurrentActivityLoading && currentActivityResult?.error && (
                <ErrorState
                  title="Could not load activity"
                  message={currentActivityResult.error}
                  onRetry={() => void fetchActivity()}
                />
              )}
              {!isCurrentActivityLoading &&
                !currentActivityResult?.error &&
                currentActivityResult.events.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No activity has been recorded yet.
                  </p>
                )}
              {!isCurrentActivityLoading &&
                !currentActivityResult?.error &&
                currentActivityResult.events.length > 0 && (
                  <ol className="space-y-4" aria-label="Work item activity, newest first">
                    {currentActivityResult.events.map((event) => (
                      <li
                        key={event.id}
                        className="flex gap-3 border-l-2 border-slate-200 pl-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">
                            {event.description}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {activityLabels[event.eventType]} · {event.actorDisplayName} ·{' '}
                            {formatDate(event.createdAtUtc)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
            </CardContent>
          </Card>
          <WorkItemComments
            key={item.id}
            workItemId={item.id}
            onCommentAdded={() => void fetchActivity()}
          />
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
              {!item.permissions?.canChangeStatus ? (
                <p className="text-xs text-slate-500">
                  Status changes are unavailable for this item.
                </p>
              ) : nextStatuses.length > 0 ? (
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
                      disabled={mutationKind !== null}
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

          <WorkItemAssignment
            key={item.id}
            item={item}
            isMutating={mutationKind !== null}
            onAssign={handleAssign}
            onRefresh={refreshItem}
          />
        </div>
      </div>

      <Modal
        isOpen={editingItem !== null}
        onClose={closeEdit}
        triggerRef={editButtonRef}
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
        {editingItem && (
          <WorkItemForm
            categories={categories}
            initialValues={{
              title: editingItem.title,
              description: editingItem.description,
              priority: editingItem.priority,
              categoryId: editingItem.categoryId,
            }}
            submitLabel="Save changes"
            onCancel={closeEdit}
            onSubmit={handleEdit}
          />
        )}
      </Modal>
    </div>
  );
};
