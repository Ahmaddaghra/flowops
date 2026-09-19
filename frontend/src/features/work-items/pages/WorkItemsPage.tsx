import React, { useState, useEffect, useCallback } from 'react';
import { workItemsApi } from '@/lib/api/workItems';
import { WorkItem, WorkItemPriority, CreateWorkItemRequest } from '@/types/workItems';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { WorkItemTable } from '../components/WorkItemTable';
import { WorkItemCard } from '../components/WorkItemCard';
import { Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { ApiError } from '@/types/api';

export const WorkItemsPage: React.FC = () => {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateWorkItemRequest>({
    title: '',
    description: '',
    priority: 'Medium',
    assigneeName: '',
  });

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

  const handleOpenModal = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'Medium',
      assigneeName: '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setFormError('Title is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await workItemsApi.create({
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        priority: formData.priority,
        assigneeName: formData.assigneeName?.trim() || null,
      });

      setIsModalOpen(false);
      await fetchItems(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(
          err.problemDetails?.detail ||
            err.problemDetails?.title ||
            err.message ||
            'Failed to create work item.'
        );
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('An unexpected error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Items"
        description="Track, prioritize, and manage operational work across your team."
        badge={
          !isLoading && !error ? (
            <Badge variant="neutral" size="sm">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </Badge>
          ) : undefined
        }
        action={
          <div className="flex items-center gap-2">
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
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenModal}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Create Item
            </Button>
          </div>
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
          title="No work items found"
          description="Get started by creating your first work item to track operational progress."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenModal}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Create First Work Item
            </Button>
          }
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

      {/* Create Work Item Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Create Work Item"
        description="Add a new work item to the operational queue."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <Input
            label="Title"
            required
            placeholder="e.g., Investigate memory leak in worker service"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            maxLength={200}
            disabled={isSubmitting}
            autoFocus
          />

          <div className="space-y-1.5 text-left">
            <label
              htmlFor="description"
              className="block text-xs font-medium text-slate-700"
            >
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              id="description"
              rows={3}
              className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Provide context, acceptance criteria, or investigation steps..."
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              maxLength={2000}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Priority"
              options={[
                { value: 'Low', label: 'Low' },
                { value: 'Medium', label: 'Medium' },
                { value: 'High', label: 'High' },
                { value: 'Critical', label: 'Critical' },
              ]}
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: e.target.value as WorkItemPriority })
              }
              disabled={isSubmitting}
            />

            <Input
              label="Assignee"
              placeholder="e.g., Alex Johnson"
              value={formData.assigneeName || ''}
              onChange={(e) => setFormData({ ...formData, assigneeName: e.target.value })}
              maxLength={100}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCloseModal}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Create Item
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
