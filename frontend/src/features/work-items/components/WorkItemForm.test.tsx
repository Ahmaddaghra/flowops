import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';
import { Category, CreateWorkItemRequest } from '@/types/workItems';
import { WorkItemForm } from './WorkItemForm';

const categories: Category[] = [{ id: 'category-1', name: 'Operations', isActive: true }];

describe('WorkItemForm', () => {
  it('validates a required title before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(_request: CreateWorkItemRequest) => Promise<void>>();

    render(
      <WorkItemForm
        categories={categories}
        submitLabel="Create item"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Create item' }));

    expect(screen.getByText('Title is required.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the complete create request and waits for success', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(_request: CreateWorkItemRequest) => Promise<void>>()
      .mockResolvedValue();

    render(
      <WorkItemForm
        categories={categories}
        includeAssignee
        submitLabel="Create item"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByLabelText('Title'), 'Investigate logins');
    await user.type(screen.getByLabelText('Description'), 'Repeated failures');
    await user.selectOptions(screen.getByLabelText('Priority'), 'High');
    await user.selectOptions(screen.getByLabelText('Category'), 'category-1');
    await user.type(screen.getByLabelText('Assignee name'), 'Ahmad');
    await user.click(screen.getByRole('button', { name: 'Create item' }));

    expect(await screen.findByRole('button', { name: 'Create item' })).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Investigate logins',
      description: 'Repeated failures',
      priority: 'High',
      categoryId: 'category-1',
      assigneeName: 'Ahmad',
    });
  });

  it('shows server field validation beside the matching control', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(_request: CreateWorkItemRequest) => Promise<void>>()
      .mockRejectedValue(
        new ApiError('Validation failed', 400, {
          errors: { Title: ['The title was rejected by the server.'] },
        })
      );

    render(
      <WorkItemForm
        categories={categories}
        submitLabel="Save changes"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByLabelText('Title'), 'A title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('The title was rejected by the server.')).toBeTruthy();
  });

  it('shows the stale work item conflict when an edit loses an optimistic concurrency race', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(_request: CreateWorkItemRequest) => Promise<void>>()
      .mockRejectedValue(
        new ApiError(
          'This work item was modified by another request. Refresh it and try again.',
          409,
          {
            title: 'Work Item Concurrency Conflict',
            detail:
              'This work item was modified by another request. Refresh it and try again.',
          }
        )
      );

    render(
      <WorkItemForm
        categories={categories}
        initialValues={{ title: 'Original title' }}
        submitLabel="Save changes"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Edited title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(
        'This work item was modified by another request. Refresh it and try again.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('Title is required.')).toBeNull();
  });
});
