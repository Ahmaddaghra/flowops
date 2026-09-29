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
  },
  {
    id: 'event-1',
    workItemId: item.id,
    eventType: 'Created',
    description: 'Work item created',
    createdAtUtc: '2026-09-29T10:00:00Z',
    actorUserId: null,
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

    vi.mocked(workItemsApi.assign).mockResolvedValue({
      ...updated,
      version: 5,
      assigneeName: 'Sara',
    });
    await user.clear(screen.getByLabelText('Assignee name'));
    await user.type(screen.getByLabelText('Assignee name'), 'Sara');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(workItemsApi.assign).toHaveBeenCalledWith(item.id, {
      assigneeName: 'Sara',
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

  it('uses the status response version for the next assignment', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.changeStatus).mockResolvedValue({
      ...item,
      status: 'InProgress',
      version: 4,
    });
    vi.mocked(workItemsApi.assign).mockResolvedValue({
      ...item,
      status: 'InProgress',
      version: 5,
      assigneeName: 'Sara',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    await screen.findByRole('button', { name: 'Move to Blocked' });
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 3,
    });
    await user.clear(screen.getByLabelText('Assignee name'));
    await user.type(screen.getByLabelText('Assignee name'), 'Sara');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(workItemsApi.assign).toHaveBeenCalledWith(item.id, {
      assigneeName: 'Sara',
      expectedVersion: 4,
    });
    expect(await screen.findByText('Currently assigned to Sara')).toBeTruthy();
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

  it('explains stale assignment conflicts and prompts refresh', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.assign).mockRejectedValue(
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
    await user.type(screen.getByLabelText('Assignee name'), 'Sara');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));

    expect(
      await screen.findByText(
        'This work item was modified by another request. Refresh it and try again.'
      )
    ).toBeTruthy();
  });

  it('clears status and assignment errors when opening another work item', async () => {
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
    vi.mocked(workItemsApi.assign).mockRejectedValue(
      new ApiError('Assignment conflict for the first item.', 409, {
        title: 'Work Item Concurrency Conflict',
        detail: 'Assignment conflict for the first item.',
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
    await user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(
      await screen.findByText('Assignment conflict for the first item.')
    ).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'Open second work item' }));
    expect(await screen.findByRole('heading', { name: secondItem.title })).toBeTruthy();
    expect(screen.queryByText(/Status conflict for the first item/)).toBeNull();
    expect(screen.queryByText('Assignment conflict for the first item.')).toBeNull();
  });

  it('ignores late status and assignment conflicts from the previous work item', async () => {
    const user = userEvent.setup();
    let rejectStatus: ((error: unknown) => void) | undefined;
    let rejectAssignment: ((error: unknown) => void) | undefined;
    vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
      id === secondItem.id ? secondItem : item
    );
    vi.mocked(workItemsApi.changeStatus).mockReturnValue(
      new Promise<WorkItem>((_, reject) => {
        rejectStatus = reject;
      })
    );
    vi.mocked(workItemsApi.assign).mockReturnValue(
      new Promise<WorkItem>((_, reject) => {
        rejectAssignment = reject;
      })
    );
    renderDetail();
    await screen.findByRole('heading', { name: item.title });

    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    await user.clear(screen.getByLabelText('Assignee name'));
    await user.type(screen.getByLabelText('Assignee name'), 'Sara');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 3,
    });
    expect(workItemsApi.assign).toHaveBeenCalledWith(item.id, {
      assigneeName: 'Sara',
      expectedVersion: 3,
    });
    await user.click(screen.getByRole('link', { name: 'Open second work item' }));
    expect(await screen.findByRole('heading', { name: secondItem.title })).toBeTruthy();

    await act(async () => {
      rejectStatus?.(new ApiError('Late status conflict from the first item.', 409));
      rejectAssignment?.(
        new ApiError('Late assignment conflict from the first item.', 409)
      );
    });

    expect(screen.queryByText('Late status conflict from the first item.')).toBeNull();
    expect(
      screen.queryByText('Late assignment conflict from the first item.')
    ).toBeNull();
  });

  it.each(['status', 'assignment'])(
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
          : vi.mocked(workItemsApi.assign);
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
          await user.clear(screen.getByLabelText('Assignee name'));
          await user.type(screen.getByLabelText('Assignee name'), 'Sara');
          await user.click(screen.getByRole('button', { name: 'Save assignment' }));
        }
      };
      renderDetail();
      await screen.findByRole('heading', { name: item.title });
      await startMutation();
      await user.click(screen.getByRole('link', { name: 'Open second work item' }));
      await screen.findByRole('heading', { name: secondItem.title });
      const control = operation === 'status' ? 'Move to In Progress' : 'Unassign';
      expect(screen.getByRole('button', { name: control })).toHaveProperty(
        'disabled',
        false
      );

      await startMutation();
      expect(screen.getByRole('button', { name: control })).toHaveProperty(
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
      expect(screen.getByRole('button', { name: control })).toHaveProperty(
        'disabled',
        true
      );
      expect(screen.getByRole('heading', { name: secondItem.title })).toBeTruthy();
      expect(screen.queryByText('Late first-item conflict')).toBeNull();

      await act(async () => {
        resolveSecond?.({
          ...secondItem,
          version: 4,
          status: operation === 'status' ? 'InProgress' : secondItem.status,
          assigneeName: operation === 'assignment' ? 'Sara' : secondItem.assigneeName,
        });
      });
      expect(
        screen.getByRole('button', {
          name: operation === 'status' ? 'Move to Blocked' : 'Unassign',
        })
      ).toHaveProperty('disabled', false);
    }
  );

  it('updates the assignee and refreshes activity', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.assign)
      .mockResolvedValueOnce({ ...item, version: 4, assigneeName: 'Sara' })
      .mockResolvedValueOnce({ ...item, version: 5, assigneeName: null });
    renderDetail();
    await screen.findByText(item.title);

    const assigneeInput = screen.getByLabelText('Assignee name');
    await user.clear(assigneeInput);
    await user.type(assigneeInput, 'Sara');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));

    expect(workItemsApi.assign).toHaveBeenCalledWith(item.id, {
      assigneeName: 'Sara',
      expectedVersion: 3,
    });
    expect(await screen.findByText('Currently assigned to Sara')).toBeTruthy();
    expect(workItemsApi.getActivity).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(workItemsApi.assign).toHaveBeenLastCalledWith(item.id, {
      assigneeName: null,
      expectedVersion: 4,
    });
  });
});
