import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { categoriesApi, workItemsApi } from '@/lib/api/workItems';
import { ApiError } from '@/types/api';
import {
  Category,
  PagedResult,
  WorkItem,
  WorkItemPriority,
  WorkItemQuery,
  WorkItemStatus,
} from '@/types/workItems';
import { CreateWorkItemModal } from '../components/CreateWorkItemModal';
import { WorkItemCard } from '../components/WorkItemCard';
import { WorkItemTable } from '../components/WorkItemTable';

const emptyPage: PagedResult<WorkItem> = {
  items: [],
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

const statuses: WorkItemStatus[] = ['Todo', 'InProgress', 'Blocked', 'Done'];
const priorities: WorkItemPriority[] = ['Low', 'Medium', 'High', 'Critical'];
const sortOptions: NonNullable<WorkItemQuery['sort']>[] = [
  'createdAt',
  'updatedAt',
  'title',
  'priority',
  'status',
];
const pageSizes = [1, 10, 20, 50, 100];
type NormalizedWorkItemQuery = WorkItemQuery &
  Required<Pick<WorkItemQuery, 'page' | 'pageSize' | 'sort' | 'direction'>>;

const parseQuery = (params: URLSearchParams): NormalizedWorkItemQuery => {
  const readPositiveInteger = (value: string | null, fallback: number, max?: number) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || (max && parsed > max)) return fallback;
    return parsed;
  };
  const status = statuses.find((value) => value === params.get('status'));
  const priority = priorities.find((value) => value === params.get('priority'));
  const sort = sortOptions.find((value) => value === params.get('sort'));
  const direction = params.get('direction') === 'asc' ? 'asc' : 'desc';

  return {
    search: params.get('search')?.trim() || undefined,
    status,
    priority,
    categoryId: params.get('categoryId') || undefined,
    assignee: params.get('assignee')?.trim() || undefined,
    page: readPositiveInteger(params.get('page'), 1),
    pageSize: readPositiveInteger(params.get('pageSize'), 20, 100),
    sort: sort ?? 'createdAt',
    direction,
  };
};

const hasCriteria = (query: WorkItemQuery) =>
  Boolean(
    query.search || query.status || query.priority || query.categoryId || query.assignee
  );

export const WorkItemsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = useMemo(() => parseQuery(searchParams), [searchParams]);
  const hasLoaded = useRef(false);
  const requestSequence = useRef(0);
  const [searchInput, setSearchInput] = useState(query.search ?? '');
  const [result, setResult] = useState<PagedResult<WorkItem>>(emptyPage);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateParam = useCallback(
    (key: string, value: string, resetPage = true, replace = false) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (value) next.set(key, value);
          else next.delete(key);
          if (resetPage && key !== 'page') next.delete('page');
          if (key === 'page' && value === '1') next.delete('page');
          return next;
        },
        { replace }
      );
    },
    [setSearchParams]
  );

  const fetchItems = useCallback(
    async (background = hasLoaded.current) => {
      const requestId = ++requestSequence.current;
      if (background) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const page = await workItemsApi.list(query);
        if (requestId === requestSequence.current) setResult(page);
      } catch (err: unknown) {
        if (requestId === requestSequence.current) {
          if (err instanceof ApiError)
            setError(err.problemDetails?.detail || err.message);
          else if (err instanceof Error) setError(err.message);
          else setError('An unexpected error occurred while loading work items.');
        }
      } finally {
        if (requestId === requestSequence.current) {
          hasLoaded.current = true;
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [query]
  );

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    setSearchInput(query.search ?? '');
  }, [query.search]);

  useEffect(() => {
    const value = searchInput.trim();
    if (value === (query.search ?? '')) return;
    const timeout = window.setTimeout(
      () => updateParam('search', value, true, true),
      300
    );
    return () => window.clearTimeout(timeout);
  }, [query.search, searchInput, updateParam]);

  useEffect(() => {
    let active = true;
    categoriesApi
      .list()
      .then((items) => {
        if (active) setCategories(items);
      })
      .catch((err: unknown) => {
        if (active)
          setCategoriesError(
            err instanceof Error ? err.message : 'Could not load categories.'
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCreated = () => {
    void fetchItems(true);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams({});
  };

  const isFiltered = hasCriteria(query);
  const hasListOptions =
    isFiltered ||
    query.page !== 1 ||
    query.pageSize !== 20 ||
    query.sort !== 'createdAt' ||
    query.direction !== 'desc';

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

      <section
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
        aria-label="Work item search and filters"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Search"
            placeholder="Title, description, or assignee"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search work items"
          />
          <Select
            label="Status"
            value={query.status ?? ''}
            onChange={(event) => updateParam('status', event.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              ...statuses.map((value) => ({
                value,
                label:
                  value === 'Todo'
                    ? 'To Do'
                    : value === 'InProgress'
                      ? 'In Progress'
                      : value,
              })),
            ]}
          />
          <Select
            label="Priority"
            value={query.priority ?? ''}
            onChange={(event) => updateParam('priority', event.target.value)}
            options={[
              { value: '', label: 'All priorities' },
              ...priorities.map((value) => ({ value, label: value })),
            ]}
          />
          <Select
            label="Category"
            value={query.categoryId ?? ''}
            onChange={(event) => updateParam('categoryId', event.target.value)}
            options={[
              { value: '', label: 'All categories' },
              ...categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
          />
          <Input
            label="Assignee"
            placeholder="Filter by name"
            value={query.assignee ?? ''}
            onChange={(event) => updateParam('assignee', event.target.value)}
          />
          <Select
            label="Sort by"
            value={query.sort ?? 'createdAt'}
            onChange={(event) => updateParam('sort', event.target.value)}
            options={sortOptions.map((value) => ({
              value,
              label:
                value === 'createdAt'
                  ? 'Created date'
                  : value === 'updatedAt'
                    ? 'Updated date'
                    : value[0].toUpperCase() + value.slice(1),
            }))}
          />
          <Select
            label="Direction"
            value={query.direction ?? 'desc'}
            onChange={(event) => updateParam('direction', event.target.value)}
            options={[
              { value: 'desc', label: 'Descending' },
              { value: 'asc', label: 'Ascending' },
            ]}
          />
          <Select
            label="Items per page"
            value={String(query.pageSize ?? 20)}
            onChange={(event) => updateParam('pageSize', event.target.value)}
            options={pageSizes.map((value) => ({
              value: String(value),
              label: String(value),
            }))}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          {categoriesError ? (
            <p className="text-xs text-rose-700" role="alert">
              {categoriesError}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Search matches titles, descriptions, and assignee names.
            </p>
          )}
          {hasListOptions && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </section>

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

      {!isLoading &&
        !error &&
        result.items.length === 0 &&
        result.totalItems === 0 &&
        isFiltered && (
          <EmptyState
            title="No work items match these filters"
            description="Try a different search or clear the current filters."
            action={
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        )}

      {!isLoading &&
        !error &&
        result.items.length === 0 &&
        !isFiltered &&
        result.totalItems === 0 && (
          <EmptyState
            title="No work items yet"
            description="Create the first item to start tracking work."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>Create work item</Button>
            }
          />
        )}

      {!isLoading && !error && result.items.length === 0 && result.totalItems > 0 && (
        <EmptyState
          title="No items on this page"
          description={`Page ${query.page} is beyond the available results.`}
          action={
            <Button
              variant="outline"
              onClick={() =>
                updateParam('page', String(Math.max(1, result.totalPages)), false)
              }
            >
              Go to last page
            </Button>
          }
        />
      )}

      {!isLoading && !error && result.items.length > 0 && (
        <div
          className={
            isRefreshing ? 'space-y-4 opacity-70 transition-opacity' : 'space-y-4'
          }
          aria-busy={isRefreshing}
        >
          {isRefreshing && (
            <p className="text-xs text-slate-500" role="status">
              Updating results…
            </p>
          )}
          <div className="hidden md:block">
            <WorkItemTable items={result.items} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {result.items.map((item) => (
              <WorkItemCard key={item.id} item={item} />
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-600">
              Showing {(result.page - 1) * result.pageSize + 1}–
              {Math.min(result.page * result.pageSize, result.totalItems)} of{' '}
              {result.totalItems}
            </p>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={query.page <= 1 || isRefreshing}
                onClick={() => updateParam('page', String(query.page - 1), false)}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-600">
                Page {result.page} of {result.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={query.page >= result.totalPages || isRefreshing}
                onClick={() => updateParam('page', String(query.page + 1), false)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <CreateWorkItemModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
};
