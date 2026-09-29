import React, { useState, useEffect, useCallback } from 'react';
import { workItemsApi } from '@/lib/api/workItems';
import { WorkItem } from '@/types/workItems';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { WorkItemTable } from '../components/WorkItemTable';
import { WorkItemCard } from '../components/WorkItemCard';
import { RefreshCw } from 'lucide-react';
import { ApiError } from '@/types/api';

export const WorkItemsPage: React.FC = () => {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const data = await workItemsApi.list();
      setItems(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(
          err.problemDetails?.detail || err.message || 'Failed to load work items.'
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while loading work items.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Items"
        description="Review operational work across your team."
        badge={
          !isLoading && !error ? (
            <Badge variant="neutral" size="sm">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </Badge>
          ) : undefined
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchItems(true)}
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
        }
      />

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
            <Skeleton className="h-6 w-1/4" />
            <div className="space-y-2 pt-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <ErrorState
          title="Could not load work items"
          message={error}
          onRetry={() => fetchItems()}
        />
      )}

      {/* Empty State */}
      {!isLoading && !error && items.length === 0 && (
        <EmptyState
          title="No work items yet"
          description="Work item creation will be introduced in Phase 3."
        />
      )}

      {/* Populated Content */}
      {!isLoading && !error && items.length > 0 && (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <WorkItemTable items={items} />
          </div>

          {/* Mobile Card View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {items.map((item) => (
              <WorkItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
