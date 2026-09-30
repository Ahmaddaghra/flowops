import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/types/api';
import { Category, CreateWorkItemRequest, WorkItemPriority } from '@/types/workItems';
import { workItemMutationErrorMessage } from '../utils/mutationErrorMessage';

interface WorkItemFormProps {
  categories: Category[];
  initialValues?: Partial<CreateWorkItemRequest>;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (request: CreateWorkItemRequest) => Promise<void>;
}

const priorities: WorkItemPriority[] = ['Low', 'Medium', 'High', 'Critical'];

const fieldErrorsFrom = (error: ApiError): Record<string, string> => {
  const errors = error.problemDetails?.errors ?? {};
  return Object.fromEntries(
    Object.entries(errors).map(([key, messages]) => [
      key.charAt(0).toLowerCase() + key.slice(1),
      messages[0] ?? 'This value is invalid.',
    ])
  );
};

export const WorkItemForm: React.FC<WorkItemFormProps> = ({
  categories,
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
}) => {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [priority, setPriority] = useState<WorkItemPriority>(
    initialValues?.priority ?? 'Medium'
  );
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearError = (field: string) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!title.trim()) nextErrors.title = 'Title is required.';
    else if (title.trim().length > 200)
      nextErrors.title = 'Title cannot exceed 200 characters.';
    if (description.length > 4000)
      nextErrors.description = 'Description cannot exceed 4000 characters.';
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description || null,
        priority,
        categoryId: categoryId || null,
        assigneeUserId: null,
      });
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setErrors(fieldErrorsFrom(error));
        setSubmitError(
          error.status === 403
            ? (error.problemDetails?.detail ??
                'You do not have permission to change this work item.')
            : error.status === 409
              ? workItemMutationErrorMessage(error, 'Could not save the work item.')
              : (error.problemDetails?.detail ??
                (error.status === 0
                  ? error.message
                  : 'Please review the highlighted fields and try again.'))
        );
      } else {
        setSubmitError(
          error instanceof Error ? error.message : 'Could not save the work item.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      {submitError && (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          role="alert"
        >
          {submitError}
        </p>
      )}
      <Input
        autoFocus
        label="Title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          clearError('title');
        }}
        maxLength={200}
        required
        error={errors.title}
      />
      <div className="space-y-1.5">
        <label
          htmlFor="work-item-description"
          className="block text-xs font-medium text-slate-700"
        >
          Description
        </label>
        <textarea
          id="work-item-description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            clearError('description');
          }}
          maxLength={4000}
          rows={4}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:border-indigo-600"
          aria-invalid={Boolean(errors.description)}
          aria-describedby={
            errors.description ? 'work-item-description-error' : undefined
          }
        />
        {errors.description && (
          <p id="work-item-description-error" className="text-xs text-rose-600">
            {errors.description}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as WorkItemPriority)}
          options={priorities.map((value) => ({ value, label: value }))}
          error={errors.priority}
        />
        <Select
          label="Category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            clearError('categoryId');
          }}
          options={[
            { value: '', label: 'No category' },
            ...categories.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          ]}
          error={errors.categoryId}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};
