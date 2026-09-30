import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';
import { Category, WorkItem, WorkItemActivity } from '@/types/workItems';
import { categoriesApi, workItemsApi } from '@/lib/api/workItems';
import { WorkItemDetailPage } from './WorkItemDetailPage';

vi.mock('@/lib/api/workItems', () => ({
  categoriesApi: { list: vi.fn() },
  workItemsApi: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    changeStatus: vi.fn(),
    assign: vi.fn(),
    getActivity: vi.fn(),
    getHealth: vi.fn(),
  },
}));

const item: WorkItem = {
  id: 'item-42',
  version: 3,
  title: 'Investigate login',
  description: 'Intermittent failure',
  status: 'Todo',
  priority: 'Medium',
  categoryId: 'category-1',
  categoryName: 'Operations',
  createdByUserId: 'user-1',
  assigneeUserId: 'user-1',
  createdBy: { id: 'user-1', displayName: 'Ahmad' },
  assignee: { id: 'user-1', displayName: 'Ahmad' },
  permissions: null,
  legacyAssigneeName: null,
  assigneeName: 'Ahmad',
  createdAtUtc: '2026-09-29T10:00:00Z',
  updatedAtUtc: '2026-09-29T10:00:00Z',
};

const secondItem: WorkItem = {
  ...item,
  id: 'item-99',
  title: 'Prepare release notes',
};

const categories: Category[] = [
  { id: 'category-1', name: 'Operations', isActive: true },
  { id: 'category-2', name: 'Support', isActive: true },
];

const activity: WorkItemActivity[] = [
  {
    id: 'event-2',
    workItemId: item.id,
    eventType: 'PriorityChanged',
    description: 'Priority changed to High',
    createdAtUtc: '2026-09-29T12:00:00Z',
    actorUserId: null,
    actor: null,
    actorDisplayName: 'System',
  },
  {
    id: 'event-1',
    workItemId: item.id,
    eventType: 'Created',
    description: 'Work item created',
    createdAtUtc: '2026-09-29T10:00:00Z',
    actorUserId: null,
    actor: null,
    actorDisplayName: 'System',
  },
];

const secondActivity: WorkItemActivity[] = [
  {
    id: 'event-99',
    workItemId: secondItem.id,
    eventType: 'Created',
    description: 'Release notes work item created',
    createdAtUtc: '2026-09-29T11:00:00Z',
    actorUserId: null,
    actor: null,
    actorDisplayName: 'System',
  },
];

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={[`/work-items/${item.id}`]}>
      <Link to={`/work-items/${secondItem.id}`}>Open second work item</Link>
      <Routes>
        <Route path="/work-items/:id" element={<WorkItemDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('WorkItemDetailPage', () => {
  beforeEach(() => {
    vi.mocked(workItemsApi.getById).mockResolvedValue(item);
    vi.mocked(workItemsApi.getActivity).mockResolvedValue(activity);
    vi.mocked(categoriesApi.list).mockResolvedValue(categories);
  });

  it('renders activity newest first and uses the System actor fallback', async () => {
    renderDetail();

    expect(await screen.findByText('Priority changed to High')).toBeTruthy();
    expect(screen.getByText('Work item created')).toBeTruthy();
    const activityList = screen.getByRole('list', {
      name: 'Work item activity, newest first',
    });
    const activityText = activityList.textContent ?? '';
    expect(activityText.indexOf('Priority changed to High')).toBeLessThan(
      activityText.indexOf('Work item created')
    );
    expect(activityText.match(/System/g)).toHaveLength(2);
  });

  it('ignores a late activity response after navigating to another work item', async () => {
    const user = userEvent.setup();
    let resolveFirstActivity: ((events: WorkItemActivity[]) => void) | undefined;
    vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
      id === secondItem.id ? secondItem : item
    );
    vi.mocked(workItemsApi.getActivity).mockImplementation((id) => {
      if (id === item.id)
        return new Promise((resolve) => {
          resolveFirstActivity = resolve;
        });
      return Promise.resolve(secondActivity);
    });

    renderDetail();
    expect(await screen.findByRole('heading', { name: item.title })).toBeTruthy();
    expect(workItemsApi.getActivity).toHaveBeenCalledWith(item.id);

    await user.click(screen.getByRole('link', { name: 'Open second work item' }));

    expect(await screen.findByRole('heading', { name: secondItem.title })).toBeTruthy();
    expect(await screen.findByText(secondActivity[0].description)).toBeTruthy();
    expect(workItemsApi.getActivity).toHaveBeenCalledWith(secondItem.id);

    await act(async () => {
      resolveFirstActivity?.(activity);
    });

    expect(screen.getByText(secondActivity[0].description)).toBeTruthy();
    expect(screen.queryByText(activity[0].description)).toBeNull();
  });

  it('ignores a late detail response after navigating to another work item', async () => {
    const user = userEvent.setup();
    let resolveFirstDetail: ((item: WorkItem) => void) | undefined;
    vi.mocked(workItemsApi.getById).mockImplementation((id) => {
      if (id === item.id)
        return new Promise((resolve) => {
          resolveFirstDetail = resolve;
        });
      return Promise.resolve(secondItem);
    });
    vi.mocked(workItemsApi.getActivity).mockImplementation((id) =>
      Promise.resolve(id === secondItem.id ? secondActivity : activity)
    );

    renderDetail();
    expect(screen.getByRole('status', { name: 'Loading work item' })).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'Open second work item' }));

    expect(await screen.findByRole('heading', { name: secondItem.title })).toBeTruthy();
    expect(workItemsApi.getById).toHaveBeenCalledWith(item.id);
    expect(workItemsApi.getById).toHaveBeenCalledWith(secondItem.id);

    await act(async () => {
      resolveFirstDetail?.(item);
    });

    expect(screen.getByRole('heading', { name: secondItem.title })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: item.title })).toBeNull();
  });

  it('edits descriptive fields without changing status', async () => {
    const user = userEvent.setup();
    const updated: WorkItem = {
      ...item,
      version: 4,
      title: 'Updated login investigation',
      priority: 'High',
      categoryId: 'category-2',
      categoryName: 'Support',
    };
    vi.mocked(workItemsApi.update).mockResolvedValue(updated);
    renderDetail();
    await screen.findByText(item.title);

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const titleInput = await screen.findByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, updated.title);
    await user.selectOptions(screen.getByLabelText('Priority'), 'High');
    await user.selectOptions(screen.getByLabelText('Category'), 'category-2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { name: updated.title })).toBeTruthy();
    expect(workItemsApi.update).toHaveBeenCalledWith(item.id, {
      title: updated.title,
      description: item.description,
      priority: 'High',
      categoryId: 'category-2',
      expectedVersion: 3,
    });
    expect(screen.getAllByText('To Do')).toHaveLength(2);

    vi.mocked(workItemsApi.changeStatus).mockResolvedValue({
      ...updated,
      version: 5,
      status: 'InProgress',
    });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 4,
    });
  });

  it('keeps a stale edit form and shows the conflict without retrying', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.update).mockRejectedValue(
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
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'My unsaved edit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'This work item was modified by another request. Refresh it and try again.'
    );
    expect(screen.getByLabelText('Title')).toHaveProperty('value', 'My unsaved edit');
    expect(workItemsApi.update).toHaveBeenCalledTimes(1);
    expect(workItemsApi.update).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ title: 'My unsaved edit', expectedVersion: 3 })
    );
    expect(workItemsApi.getById).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: item.title })).toBeTruthy();
  });

  it('uses the status response version for the next edit', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.changeStatus).mockResolvedValue({
      ...item,
      status: 'InProgress',
      version: 4,
    });
    vi.mocked(workItemsApi.update).mockResolvedValue({
      ...item,
      status: 'InProgress',
      version: 5,
      title: 'Updated investigation',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    await screen.findByRole('button', { name: 'Move to Blocked' });
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 3,
    });
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Updated investigation');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(workItemsApi.update).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ title: 'Updated investigation', expectedVersion: 4 })
    );
    expect(
      await screen.findByRole('heading', { name: 'Updated investigation' })
    ).toBeTruthy();
  });

  it('shows a clear conflict when the server rejects a status transition', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.changeStatus).mockRejectedValue(
      new ApiError('A work item cannot transition from Todo to InProgress.', 409, {
        title: 'Invalid Work Item Transition',
        detail: 'A work item cannot transition from Todo to InProgress.',
      })
    );
    renderDetail();
    await screen.findByText(item.title);

    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));

    expect(
      await screen.findByText(
        'This status change is not allowed: A work item cannot transition from Todo to InProgress.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/modified by another request/i)).toBeNull();
  });

  it('explains when a status mutation conflicts with a newer server version', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.changeStatus).mockRejectedValue(
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
    renderDetail();
    await screen.findByText(item.title);

    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));

    expect(
      await screen.findByText(
        'This work item was modified by another request. Refresh it and try again.'
      )
    ).toBeTruthy();
    expect(workItemsApi.changeStatus).toHaveBeenCalledTimes(1);
  });

  it('shows a permission message when a status mutation is forbidden', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.changeStatus).mockRejectedValue(
      new ApiError('You do not have permission to perform this action.', 403)
    );
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    expect(
      await screen.findByText('You do not have permission to perform this action.')
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: item.title })).toBeTruthy();
    expect(workItemsApi.changeStatus).toHaveBeenCalledTimes(1);
  });

  it('clears status and edit errors when opening another work item', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
      id === secondItem.id ? secondItem : item
    );
    vi.mocked(workItemsApi.changeStatus).mockRejectedValue(
      new ApiError('Status conflict for the first item.', 409, {
        title: 'Invalid Work Item Transition',
        detail: 'Status conflict for the first item.',
      })
    );
    vi.mocked(workItemsApi.update).mockRejectedValue(
      new ApiError('Edit conflict for the first item.', 409, {
        title: 'Work Item Concurrency Conflict',
        detail: 'Edit conflict for the first item.',
      })
    );
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    expect(
      await screen.findByText(
        'This status change is not allowed: Status conflict for the first item.'
      )
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Unsaved first item');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Edit conflict for the first item.')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Open second work item' }));
    expect(await screen.findByRole('heading', { name: secondItem.title })).toBeTruthy();
    expect(screen.queryByText(/Status conflict for the first item/)).toBeNull();
    expect(screen.queryByText('Edit conflict for the first item.')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores late status and edit conflicts from the previous work item', async () => {
    const user = userEvent.setup();
    let rejectStatus: ((error: unknown) => void) | undefined;
    let rejectEdit: ((error: unknown) => void) | undefined;
    vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
      id === secondItem.id ? secondItem : item
    );
    vi.mocked(workItemsApi.changeStatus).mockReturnValue(
      new Promise<WorkItem>((_, reject) => {
        rejectStatus = reject;
      })
    );
    vi.mocked(workItemsApi.update).mockReturnValue(
      new Promise<WorkItem>((_, reject) => {
        rejectEdit = reject;
      })
    );
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Pending first edit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 3,
    });
    expect(workItemsApi.update).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ title: 'Pending first edit', expectedVersion: 3 })
    );
    await user.click(screen.getByRole('link', { name: 'Open second work item' }));
    expect(await screen.findByRole('heading', { name: secondItem.title })).toBeTruthy();
    await act(async () => {
      rejectStatus?.(new ApiError('Late status conflict from the first item.', 409));
      rejectEdit?.(new ApiError('Late edit conflict from the first item.', 409));
    });
    expect(screen.queryByText('Late status conflict from the first item.')).toBeNull();
    expect(screen.queryByText('Late edit conflict from the first item.')).toBeNull();
  });

  it.each(['status', 'edit'])(
    'scopes a pending %s mutation to its route and ignores its late completion',
    async (operation) => {
      const user = userEvent.setup();
      let resolveFirst: ((value: WorkItem) => void) | undefined;
      let rejectFirst: ((error: unknown) => void) | undefined;
      let resolveSecond: ((value: WorkItem) => void) | undefined;
      const first = new Promise<WorkItem>((resolve, reject) => {
        resolveFirst = resolve;
        rejectFirst = reject;
      });
      const second = new Promise<WorkItem>((resolve) => {
        resolveSecond = resolve;
      });
      const mutation =
        operation === 'status'
          ? vi.mocked(workItemsApi.changeStatus)
          : vi.mocked(workItemsApi.update);
      mutation.mockReturnValueOnce(first).mockReturnValueOnce(second);
      vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
        id === secondItem.id ? secondItem : item
      );
      vi.mocked(workItemsApi.getActivity).mockImplementation(async (id) =>
        id === secondItem.id ? secondActivity : activity
      );
      const startMutation = async () => {
        if (operation === 'status')
          await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
        else {
          await user.click(screen.getByRole('button', { name: 'Edit details' }));
          await user.clear(screen.getByLabelText('Title'));
          await user.type(screen.getByLabelText('Title'), 'Edited current item');
          await user.click(screen.getByRole('button', { name: 'Save changes' }));
        }
      };
      renderDetail();
      await screen.findByRole('heading', { name: item.title });
      await startMutation();
      await user.click(screen.getByRole('link', { name: 'Open second work item' }));
      await screen.findByRole('heading', { name: secondItem.title });
      expect(
        screen.getByRole('button', {
          name: operation === 'status' ? 'Move to In Progress' : 'Edit details',
        })
      ).toHaveProperty('disabled', false);
      await startMutation();
      const pendingControl =
        operation === 'status' ? 'Move to In Progress' : 'Save changes';
      expect(screen.getByRole('button', { name: pendingControl })).toHaveProperty(
        'disabled',
        true
      );
      await act(async () => {
        if (operation === 'status')
          resolveFirst?.({
            ...item,
            version: 4,
            title: 'Late first-item response',
            status: 'InProgress',
          });
        else rejectFirst?.(new ApiError('Late first-item conflict', 409));
      });
      expect(screen.getByRole('button', { name: pendingControl })).toHaveProperty(
        'disabled',
        true
      );
      expect(screen.getByRole('heading', { name: secondItem.title })).toBeTruthy();
      expect(screen.queryByText('Late first-item conflict')).toBeNull();
      await act(async () => {
        resolveSecond?.({
          ...secondItem,
          version: 4,
          title: operation === 'edit' ? 'Second saved edit' : secondItem.title,
          status: operation === 'status' ? 'InProgress' : secondItem.status,
        });
      });
      expect(
        screen.getByRole('button', {
          name: operation === 'status' ? 'Move to Blocked' : 'Edit details',
        })
      ).toHaveProperty('disabled', false);
      expect(workItemsApi.getActivity).toHaveBeenCalledTimes(3);
    }
  );

  it('shows current and historical assignees read-only without assignment controls', async () => {
    vi.mocked(workItemsApi.getById).mockResolvedValue({
      ...item,
      legacyAssigneeName: 'Legacy display name',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    expect(screen.getByText('Current assignee:')).toHaveProperty(
      'textContent',
      'Current assignee: Ahmad'
    );
    expect(screen.getByText('Historical assignee: Legacy display name')).toBeTruthy();
    expect(screen.queryByLabelText('Assignee name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save assignment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unassign' })).toBeNull();
    expect(workItemsApi.assign).not.toHaveBeenCalled();
  });

  it('keeps a legacy snapshot separate from current user assignment', async () => {
    vi.mocked(workItemsApi.getById).mockResolvedValue({
      ...item,
      createdByUserId: null,
      assigneeUserId: null,
      createdBy: null,
      assignee: null,
      legacyAssigneeName: 'Ahmad',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.getByText('Historical assignee: Ahmad')).toBeTruthy();
  });

  it('renders the authenticated activity actor display name instead of their ID', async () => {
    vi.mocked(workItemsApi.getActivity).mockResolvedValue([
      {
        ...activity[0],
        actorUserId: 'user-actor',
        actor: { id: 'user-actor', displayName: 'Sara' },
        actorDisplayName: 'Sara',
      },
    ]);
    renderDetail();
    const activityList = await screen.findByRole('list', {
      name: 'Work item activity, newest first',
    });
    expect(activityList.textContent).toContain('Sara');
    expect(activityList.textContent).not.toContain('user-actor');
  });
});
