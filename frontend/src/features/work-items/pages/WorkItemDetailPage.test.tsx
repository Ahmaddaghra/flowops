import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';
import {
  Category,
  WorkItem,
  WorkItemActivity,
  WorkItemComment,
  WorkItemPermissions,
} from '@/types/workItems';
import { categoriesApi, workItemsApi } from '@/lib/api/workItems';
import { usersApi } from '@/lib/api/users';
import { AuthContext, type AuthContextValue } from '@/features/auth/context';
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
    getComments: vi.fn(),
    addComment: vi.fn(),
    getHealth: vi.fn(),
  },
}));

vi.mock('@/lib/api/users', () => ({ usersApi: { list: vi.fn() } }));

const baselinePermissions: WorkItemPermissions = {
  canEdit: true,
  canChangeStatus: true,
  canAssign: false,
  canSelfAssign: false,
  canUnassign: false,
  canAssignOthers: false,
};

const noPermissions: WorkItemPermissions = {
  canEdit: false,
  canChangeStatus: false,
  canAssign: false,
  canSelfAssign: false,
  canUnassign: false,
  canAssignOthers: false,
};

const adminPermissions: WorkItemPermissions = {
  canEdit: true,
  canChangeStatus: true,
  canAssign: true,
  canSelfAssign: false,
  canUnassign: true,
  canAssignOthers: true,
};

let auth: AuthContextValue;

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
  permissions: baselinePermissions,
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

const comment: WorkItemComment = {
  id: 'comment-1',
  workItemId: item.id,
  body: 'Investigation update',
  createdAtUtc: '2026-09-30T12:00:00Z',
  author: { id: 'user-2', displayName: 'Sara' },
};

const commentActivity: WorkItemActivity = {
  id: 'comment-event-1',
  workItemId: item.id,
  eventType: 'CommentAdded',
  description: 'Comment added',
  createdAtUtc: comment.createdAtUtc,
  actorUserId: comment.author.id,
  actor: comment.author,
  actorDisplayName: comment.author.displayName,
};

const renderDetail = () =>
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[`/work-items/${item.id}`]}>
        <Link to={`/work-items/${secondItem.id}`}>Open second work item</Link>
        <Routes>
          <Route path="/work-items/:id" element={<WorkItemDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe('WorkItemDetailPage', () => {
  beforeEach(() => {
    auth = {
      user: {
        id: 'user-1',
        email: 'member@example.test',
        displayName: 'Ahmad',
        roles: ['Member'],
      },
      accessToken: 'fake-test-session',
      expiresAtUtc: '2099-01-01T00:00:00Z',
      isAuthenticated: true,
      isInitializing: false,
      initializationError: null,
      sessionExpired: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      retryInitialization: vi.fn(),
    };
    vi.mocked(workItemsApi.getById).mockResolvedValue(item);
    vi.mocked(workItemsApi.getActivity).mockResolvedValue(activity);
    vi.mocked(workItemsApi.getComments).mockResolvedValue([]);
    vi.mocked(workItemsApi.addComment).mockResolvedValue(comment);
    vi.mocked(categoriesApi.list).mockResolvedValue(categories);
    vi.mocked(usersApi.list).mockResolvedValue([
      { id: 'user-1', displayName: 'Ahmad' },
      { id: 'user-2', displayName: 'Sara' },
    ]);
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
    expect((await screen.findByRole('alert')).textContent).toContain('permission');
    expect(screen.getByRole('heading', { name: item.title })).toBeTruthy();
    expect(workItemsApi.changeStatus).toHaveBeenCalledTimes(1);
    expect(workItemsApi.getById).toHaveBeenCalledTimes(1);
    expect(workItemsApi.getActivity).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
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

  it('blocks concurrent editing during a status request and ignores its late conflict after navigation', async () => {
    const user = userEvent.setup();
    let rejectStatus: ((error: unknown) => void) | undefined;
    vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
      id === secondItem.id ? secondItem : item
    );
    vi.mocked(workItemsApi.changeStatus).mockReturnValue(
      new Promise<WorkItem>((_, reject) => {
        rejectStatus = reject;
      })
    );
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    expect(screen.getByRole('button', { name: 'Edit details' })).toHaveProperty(
      'disabled',
      true
    );
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 3,
    });
    expect(workItemsApi.update).not.toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: 'Open second work item' }));
    expect(await screen.findByRole('heading', { name: secondItem.title })).toBeTruthy();
    await act(async () => {
      rejectStatus?.(new ApiError('Late status conflict from the first item.', 409));
    });
    expect(screen.queryByText('Late status conflict from the first item.')).toBeNull();
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

  it('prefers a real assignee over the historical snapshot without unauthorized assignment controls', async () => {
    vi.mocked(workItemsApi.getById).mockResolvedValue({
      ...item,
      legacyAssigneeName: 'Legacy display name',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    expect(screen.getByText('Assigned to:')).toHaveProperty(
      'textContent',
      'Assigned to: Ahmad'
    );
    expect(screen.queryByText(/Historical assignment: Legacy display name/)).toBeNull();
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
    expect(screen.getByText('Historical assignment: Ahmad')).toBeTruthy();
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

  it.each([
    {
      name: 'Admin',
      roles: ['Admin'],
      permissions: adminPermissions,
      edit: true,
      status: true,
      directory: true,
      unassign: false,
    },
    {
      name: 'creator Member',
      roles: ['Member'],
      permissions: baselinePermissions,
      edit: true,
      status: true,
      directory: false,
      unassign: false,
    },
    {
      name: 'assigned Member',
      roles: ['Member'],
      permissions: { ...baselinePermissions, canAssign: true, canUnassign: true },
      edit: true,
      status: true,
      directory: false,
      unassign: true,
    },
    {
      name: 'unrelated Member',
      roles: ['Member'],
      permissions: noPermissions,
      edit: false,
      status: false,
      directory: false,
      unassign: false,
    },
    {
      name: 'Admin with denied server capabilities',
      roles: ['Admin'],
      permissions: noPermissions,
      edit: false,
      status: false,
      directory: false,
      unassign: false,
    },
    {
      name: 'missing capability response',
      roles: ['Admin'],
      permissions: null,
      edit: false,
      status: false,
      directory: false,
      unassign: false,
    },
  ])(
    'uses server capabilities for visible controls for $name',
    async ({ roles, permissions, edit, status, directory, unassign }) => {
      auth.user = { ...auth.user!, roles };
      vi.mocked(workItemsApi.getById).mockResolvedValue({ ...item, permissions });
      renderDetail();
      await screen.findByRole('heading', { name: item.title });
      expect(Boolean(screen.queryByRole('button', { name: 'Edit details' }))).toBe(edit);
      expect(Boolean(screen.queryByRole('button', { name: 'Move to In Progress' }))).toBe(
        status
      );
      expect(Boolean(screen.queryByRole('button', { name: 'Change assignment' }))).toBe(
        directory
      );
      expect(Boolean(screen.queryByRole('button', { name: 'Unassign me' }))).toBe(
        unassign
      );
      expect(usersApi.list).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Assignee name')).toBeNull();
    }
  );

  it('does not derive permission from a legacy name matching the authenticated display name', async () => {
    vi.mocked(workItemsApi.getById).mockResolvedValue({
      ...item,
      createdByUserId: null,
      createdBy: null,
      assigneeUserId: null,
      assignee: null,
      permissions: noPermissions,
      legacyAssigneeName: 'Ahmad',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    expect(screen.getByText(/Historical assignment: Ahmad/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to In Progress' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change assignment' })).toBeNull();
    expect(usersApi.list).not.toHaveBeenCalled();
  });

  it('uses the self-assignment response version 8 for the next status mutation', async () => {
    const user = userEvent.setup();
    const unassigned: WorkItem = {
      ...item,
      version: 7,
      createdByUserId: 'creator-other',
      createdBy: { id: 'creator-other', displayName: 'Creator' },
      assigneeUserId: null,
      assignee: null,
      assigneeName: null,
      permissions: { ...noPermissions, canAssign: true, canSelfAssign: true },
    };
    const assigned: WorkItem = {
      ...unassigned,
      version: 8,
      assigneeUserId: 'user-1',
      assignee: item.assignee,
      assigneeName: 'Ahmad',
      permissions: { ...baselinePermissions, canAssign: true, canUnassign: true },
    };
    vi.mocked(workItemsApi.getById).mockResolvedValue(unassigned);
    vi.mocked(workItemsApi.assign).mockResolvedValue(assigned);
    vi.mocked(workItemsApi.changeStatus).mockResolvedValue({
      ...assigned,
      version: 9,
      status: 'InProgress',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));
    await screen.findByRole('button', { name: 'Unassign me' });
    expect(workItemsApi.assign).toHaveBeenCalledWith(item.id, {
      assigneeUserId: 'user-1',
      expectedVersion: 7,
    });
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 8,
    });
    await screen.findByRole('button', { name: 'Move to Blocked' });
    expect(usersApi.list).not.toHaveBeenCalled();
  });

  it('uses an Admin reassignment response version 9 for the next edit', async () => {
    const user = userEvent.setup();
    auth.user = { ...auth.user!, id: 'admin-user', roles: ['Admin'] };
    const initial: WorkItem = { ...item, version: 8, permissions: adminPermissions };
    const reassigned: WorkItem = {
      ...initial,
      version: 9,
      assigneeUserId: 'user-2',
      assignee: { id: 'user-2', displayName: 'Sara' },
      assigneeName: 'Sara',
    };
    vi.mocked(workItemsApi.getById).mockResolvedValue(initial);
    vi.mocked(workItemsApi.assign).mockResolvedValue(reassigned);
    vi.mocked(workItemsApi.update).mockResolvedValue({
      ...reassigned,
      version: 10,
      title: 'Saved after reassignment',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Change assignment' }));
    await user.selectOptions(await screen.findByLabelText('Assign to'), 'user-2');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(workItemsApi.assign).toHaveBeenCalledWith(item.id, {
      assigneeUserId: 'user-2',
      expectedVersion: 8,
    });
    await waitFor(() =>
      expect(screen.getByText(/Assigned to:/).textContent).toContain('Sara')
    );
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Saved after reassignment');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(workItemsApi.update).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ expectedVersion: 9 })
    );
    await screen.findByRole('heading', { name: 'Saved after reassignment' });
  });

  it('uses the returned unassignment response without incrementing the local version', async () => {
    const user = userEvent.setup();
    const assigned = {
      ...item,
      version: 7,
      permissions: { ...baselinePermissions, canAssign: true, canUnassign: true },
    };
    const unassigned: WorkItem = {
      ...assigned,
      version: 11,
      assigneeUserId: null,
      assignee: null,
      assigneeName: null,
      permissions: { ...baselinePermissions, canAssign: true, canSelfAssign: true },
    };
    vi.mocked(workItemsApi.getById).mockResolvedValue(assigned);
    vi.mocked(workItemsApi.assign)
      .mockResolvedValueOnce(unassigned)
      .mockResolvedValueOnce({ ...assigned, version: 12 });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Unassign me' }));
    await screen.findByRole('button', { name: 'Assign to me' });
    expect(workItemsApi.assign).toHaveBeenNthCalledWith(1, item.id, {
      assigneeUserId: null,
      expectedVersion: 7,
    });
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));
    expect(workItemsApi.assign).toHaveBeenNthCalledWith(2, item.id, {
      assigneeUserId: 'user-1',
      expectedVersion: 11,
    });
  });

  it.each([403, 409])(
    'keeps the item and matching session after an assignment %s without automatic refresh or retry',
    async (status) => {
      const user = userEvent.setup();
      const unassigned = {
        ...item,
        assigneeUserId: null,
        assignee: null,
        assigneeName: null,
        permissions: { ...baselinePermissions, canAssign: true, canSelfAssign: true },
      };
      vi.mocked(workItemsApi.getById).mockResolvedValue(unassigned);
      vi.mocked(workItemsApi.assign).mockRejectedValue(
        new ApiError(
          status === 403
            ? 'You do not have permission to perform this action.'
            : 'This work item was modified by another request. Refresh it and try again.',
          status,
          status === 409 ? { title: 'Work Item Concurrency Conflict' } : undefined
        )
      );
      renderDetail();
      await screen.findByRole('heading', { name: item.title });
      await user.click(screen.getByRole('button', { name: 'Assign to me' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        status === 403 ? 'permission' : 'Refresh'
      );
      expect(screen.getByRole('heading', { name: item.title })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Assign to me' })).toHaveProperty(
        'disabled',
        false
      );
      expect(workItemsApi.assign).toHaveBeenCalledTimes(1);
      expect(workItemsApi.getById).toHaveBeenCalledTimes(1);
      expect(workItemsApi.getActivity).toHaveBeenCalledTimes(1);
      expect(auth.logout).not.toHaveBeenCalled();
      expect(auth.isAuthenticated).toBe(true);
    }
  );

  it('prevents rapid assignment and status interactions from sending concurrent mutations', async () => {
    const unassigned = {
      ...item,
      assigneeUserId: null,
      assignee: null,
      permissions: { ...baselinePermissions, canAssign: true, canSelfAssign: true },
    };
    vi.mocked(workItemsApi.getById).mockResolvedValue(unassigned);
    vi.mocked(workItemsApi.assign).mockReturnValue(new Promise(() => undefined));
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    const assignment = screen.getByRole('button', { name: 'Assign to me' });
    fireEvent.click(assignment);
    fireEvent.click(assignment);
    fireEvent.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    expect(workItemsApi.assign).toHaveBeenCalledTimes(1);
    expect(workItemsApi.changeStatus).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit details' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('ignores an old assignment response after opening another work item', async () => {
    const user = userEvent.setup();
    let resolveAssignment: ((updated: WorkItem) => void) | undefined;
    const first: WorkItem = {
      ...item,
      assigneeUserId: null,
      assignee: null,
      permissions: { ...baselinePermissions, canAssign: true, canSelfAssign: true },
    };
    vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
      id === secondItem.id ? secondItem : first
    );
    vi.mocked(workItemsApi.assign).mockReturnValue(
      new Promise((resolve) => {
        resolveAssignment = resolve;
      })
    );
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Assign to me' }));
    await user.click(screen.getByRole('link', { name: 'Open second work item' }));
    await screen.findByRole('heading', { name: secondItem.title });
    await act(async () =>
      resolveAssignment?.({
        ...first,
        title: 'Late first assignment response',
        version: 10,
        assignee: item.assignee,
        assigneeUserId: 'user-1',
      })
    );
    expect(screen.getByRole('heading', { name: secondItem.title })).toBeTruthy();
    expect(screen.queryByText('Late first assignment response')).toBeNull();
    expect(workItemsApi.getActivity).toHaveBeenCalledTimes(2);
  });

  it('does not expose a previous route user directory result on the next item', async () => {
    const user = userEvent.setup();
    let resolveUsers:
      ((users: { id: string; displayName: string }[]) => void) | undefined;
    vi.mocked(workItemsApi.getById).mockImplementation(async (id) => ({
      ...(id === secondItem.id ? secondItem : item),
      permissions: adminPermissions,
    }));
    vi.mocked(usersApi.list)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUsers = resolve;
        })
      )
      .mockResolvedValueOnce([
        { id: 'fresh-user', displayName: 'Current directory user' },
      ]);
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.click(screen.getByRole('button', { name: 'Change assignment' }));
    expect(screen.getByText('Loading users…')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Open second work item' }));
    await screen.findByRole('heading', { name: secondItem.title });
    await user.click(screen.getByRole('button', { name: 'Change assignment' }));
    await screen.findByRole('option', { name: 'Current directory user' });
    await act(async () =>
      resolveUsers?.([{ id: 'stale-user', displayName: 'Stale directory user' }])
    );
    expect(screen.queryByRole('option', { name: 'Stale directory user' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Current directory user' })).toBeTruthy();
  });

  it.each([false, true])(
    'traps keyboard focus and restores Edit details after Escape (activity completes while open: %s)',
    async (completeActivityWhileOpen) => {
      const user = userEvent.setup();
      // jsdom has no layout; make visible controls measurable for the focus trap.
      vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
        new DOMRect(),
      ] as unknown as DOMRectList);
      let resolveActivity: ((events: WorkItemActivity[]) => void) | undefined;
      if (completeActivityWhileOpen)
        vi.mocked(workItemsApi.getActivity).mockReturnValue(
          new Promise((resolve) => {
            resolveActivity = resolve;
          })
        );
      renderDetail();
      await screen.findByRole('heading', { name: item.title });
      const trigger = screen.getByRole('button', { name: 'Edit details' });
      for (let step = 0; step < 10 && document.activeElement !== trigger; step++)
        await user.tab();
      expect(document.activeElement).toBe(trigger);
      await user.keyboard('{Enter}');
      await screen.findByRole('dialog', { name: 'Edit work item details' });
      const close = screen.getByRole('button', { name: 'Close dialog' });
      expect(document.activeElement).toBe(close);
      await user.keyboard('{Shift>}{Tab}{/Shift}');
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Save changes' })
      );
      await user.tab();
      expect(document.activeElement).toBe(close);
      await user.tab();
      expect(document.activeElement).toBe(screen.getByLabelText('Title'));
      if (completeActivityWhileOpen) {
        await act(async () => resolveActivity?.(activity));
        expect(document.activeElement).toBe(screen.getByLabelText('Title'));
      }
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    }
  );

  it('restores edit trigger focus after saving and completing a delayed activity refresh', async () => {
    const user = userEvent.setup();
    let resolveActivity: ((events: WorkItemActivity[]) => void) | undefined;
    vi.mocked(workItemsApi.getActivity)
      .mockResolvedValueOnce(activity)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveActivity = resolve;
        })
      );
    vi.mocked(workItemsApi.update).mockResolvedValue({
      ...item,
      title: 'Saved title',
      version: 4,
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    const trigger = screen.getByRole('button', { name: 'Edit details' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog');
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Saved title');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(workItemsApi.getActivity).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(trigger.hasAttribute('disabled')).toBe(true);
    await act(async () => resolveActivity?.(activity));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('heading', { name: 'Saved title' })).toBeTruthy();
  });

  it('allows commenting on readable legacy items without edit, status or assignment permissions', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.getById).mockResolvedValue({
      ...item,
      createdByUserId: null,
      createdBy: null,
      assigneeUserId: null,
      assignee: null,
      legacyAssigneeName: 'Historical owner',
      permissions: noPermissions,
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move to In Progress' })).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), comment.body);
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    await screen.findByText(comment.body);
    expect(workItemsApi.addComment).toHaveBeenCalledWith(item.id, { body: comment.body });
  });

  it('refreshes CommentAdded activity after POST without fetching detail or altering the status expectedVersion', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.getActivity)
      .mockResolvedValueOnce(activity)
      .mockResolvedValueOnce([commentActivity, ...activity])
      .mockResolvedValueOnce([commentActivity, ...activity]);
    vi.mocked(workItemsApi.changeStatus).mockResolvedValue({
      ...item,
      version: 4,
      status: 'InProgress',
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), comment.body);
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    await screen.findByText(comment.body);
    await waitFor(() => expect(workItemsApi.getActivity).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(/Comment added/).length).toBe(2);
    expect(workItemsApi.getById).toHaveBeenCalledTimes(1);
    expect(workItemsApi.getComments).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Move to In Progress' }));
    expect(workItemsApi.changeStatus).toHaveBeenCalledWith(item.id, {
      status: 'InProgress',
      expectedVersion: 3,
    });
  });

  it('preserves an open edit snapshot while a pending comment completes and submits the same expectedVersion', async () => {
    const user = userEvent.setup();
    let completeComment!: (result: WorkItemComment) => void;
    vi.mocked(workItemsApi.addComment).mockReturnValue(
      new Promise((resolve) => {
        completeComment = resolve;
      })
    );
    vi.mocked(workItemsApi.update).mockResolvedValue({
      ...item,
      title: 'Edit after comment',
      version: 4,
    });
    renderDetail();
    await screen.findByRole('heading', { name: item.title });
    await user.type(
      screen.getByRole('textbox', { name: 'Add a comment' }),
      'Pending collaboration'
    );
    await user.click(screen.getByRole('button', { name: 'Add comment' }));
    const trigger = screen.getByRole('button', { name: 'Edit details' });
    expect(trigger).toHaveProperty('disabled', false);
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Edit after comment');
    await act(async () => completeComment(comment));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Edit after comment');
    expect(workItemsApi.getById).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { name: 'Edit after comment' });
    expect(workItemsApi.update).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ title: 'Edit after comment', expectedVersion: 3 })
    );
  });

  it('keeps detail, status, assignment and editing usable when comments fail to load', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.getComments).mockRejectedValue(new Error('Comments offline.'));
    vi.mocked(workItemsApi.getById).mockResolvedValue({
      ...item,
      permissions: adminPermissions,
    });
    renderDetail();
    await screen.findByText('Comments offline.');
    expect(screen.getByRole('heading', { name: item.title })).toBeTruthy();
    expect(screen.getByText('Priority changed to High')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move to In Progress' })).toHaveProperty(
      'disabled',
      false
    );
    expect(screen.getByRole('button', { name: 'Change assignment' })).toHaveProperty(
      'disabled',
      false
    );
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it.each([false, true])(
    'does not apply an old route comment POST or refresh the next route activity (error: %s)',
    async (fails) => {
      const user = userEvent.setup();
      let complete!: (result: WorkItemComment) => void;
      let reject!: (error: Error) => void;
      vi.mocked(workItemsApi.addComment).mockReturnValue(
        new Promise((resolve, fail) => {
          complete = resolve;
          reject = fail;
        })
      );
      vi.mocked(workItemsApi.getById).mockImplementation(async (id) =>
        id === secondItem.id ? secondItem : item
      );
      renderDetail();
      await screen.findByRole('heading', { name: item.title });
      await user.type(
        screen.getByRole('textbox', { name: 'Add a comment' }),
        'Old item draft'
      );
      await user.click(screen.getByRole('button', { name: 'Add comment' }));
      await user.click(screen.getByRole('link', { name: 'Open second work item' }));
      await screen.findByRole('heading', { name: secondItem.title });
      const currentDraft = screen.getByRole('textbox', { name: 'Add a comment' });
      await user.type(currentDraft, 'New item draft');
      await act(async () => {
        if (fails) reject(new Error('Old comment failed.'));
        else complete(comment);
      });
      expect(screen.queryByText(comment.body)).toBeNull();
      expect(screen.queryByText('Old comment failed.')).toBeNull();
      expect(currentDraft).toHaveProperty('value', 'New item draft');
      expect(screen.getByRole('button', { name: 'Add comment' })).toHaveProperty(
        'disabled',
        false
      );
      expect(workItemsApi.getActivity).toHaveBeenCalledTimes(2);
      expect(workItemsApi.getActivity).toHaveBeenLastCalledWith(secondItem.id);
    }
  );
});
