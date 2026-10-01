import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { categoriesApi, workItemsApi } from '@/lib/api/workItems';
import { Category, CreateWorkItemRequest } from '@/types/workItems';
import { WorkItemForm } from './WorkItemForm';

interface CreateWorkItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export const CreateWorkItemModal: React.FC<CreateWorkItemModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setCategoryError(null);
    try {
      setCategories(await categoriesApi.list());
    } catch (error: unknown) {
      setCategoryError(
        error instanceof Error ? error.message : 'Could not load categories.'
      );
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadCategories();
  }, [isOpen, loadCategories]);

  const handleSubmit = async (request: CreateWorkItemRequest) => {
    await workItemsApi.create(request);
    onCreated();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create work item"
      description="Add an item to the team work queue."
      className="max-h-[90vh] overflow-y-auto"
    >
      {categoryError && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          role="alert"
        >
          <span>{categoryError}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadCategories()}
          >
            Retry
          </Button>
        </div>
      )}
      {isLoadingCategories ? (
        <p className="py-8 text-center text-sm text-slate-500" role="status">
          Loading categories…
        </p>
      ) : (
        <WorkItemForm
          categories={categories}
          submitLabel="Create item"
          onCancel={onClose}
          onSubmit={handleSubmit}
        />
      )}
    </Modal>
  );
};
