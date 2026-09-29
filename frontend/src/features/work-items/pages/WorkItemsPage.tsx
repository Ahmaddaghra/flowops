import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import { workItemsApi } from '@/lib/api/workItems';
import { PagedResult, WorkItem } from '@/types/workItems';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { WorkItemTable } from '../components/WorkItemTable';
import { WorkItemCard } from '../components/WorkItemCard';
import { CreateWorkItemModal } from '../components/CreateWorkItemModal';
import { ApiError } from '@/types/api';

const emptyPage: PagedResult<WorkItem> = {
  items: [],
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

export const WorkItemsPage: React.FC = () => {
  const [result, setResult] = useState<PagedResult<WorkItem>>(emptyPage);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async (background = false) => {
    if (background) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      setResult(await workItemsApi.list());
    } catch (err: unknown) {
      if (err instanceof ApiError) setError(err.problemDetails?.detail || err.message);
      else if (err instanceof Error) setError(err.message);
      else setError('An unexpected error occurred while loading work items.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const handleCreated = () => {
    void fetchItems(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Items"
        description="Create, assign, and move operational work through its lifecycle."
        badge={
          !isLoading && !error ? (
            <Badge variant="neutral" size="sm">
              {result.totalItems} {result.totalItems === 1 ? 'item' : 'items'}
            </Badge>
          ) : undefined
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchItems(true)}
              isLoading={isRefreshing}
              leftIcon={
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                />
              }
              disabled={isLoading || isRefreshing}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Create work item
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
          role="status"
          aria-label="Loading work items"
        >
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!isLoading && error && (
        <ErrorState
          title="Could not load work items"
          message={error}
          onRetry={() => void fetchItems()}
        />
      )}

      {!isLoading && !error && result.items.length === 0 && (
        <EmptyState
          title="No work items yet"
          description="Create the first item to start tracking work."
          action={<Button onClick={() => setIsCreateOpen(true)}>Create work item</Button>}
        />
      )}

      {!isLoading && !error && result.items.length > 0 && (
        <>
          <div className="hidden md:block">
            <WorkItemTable items={result.items} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {result.items.map((item) => (
              <WorkItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      <CreateWorkItemModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
};
