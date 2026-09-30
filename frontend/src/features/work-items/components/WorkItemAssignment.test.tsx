import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/context';
import { usersApi } from '@/lib/api/users';
import { ApiError } from '@/types/api';
import type { WorkItem, WorkItemPermissions } from '@/types/workItems';
import { WorkItemAssignment } from './WorkItemAssignment';

vi.mock('@/lib/api/users', () => ({ usersApi: { list: vi.fn() } }));

const denied: WorkItemPermissions = {
  canEdit: false,
  canChangeStatus: false,
  canAssign: false,
  canSelfAssign: false,
  canUnassign: false,
  canAssignOthers: false,
};
const admin: WorkItemPermissions = {
  canEdit: true,
  canChangeStatus: true,
  canAssign: true,
  canSelfAssign: true,
  canUnassign: true,
  canAssignOthers: true,
};
const item: WorkItem = {
  id: 'item-1',
  version: 7,
  title: 'Assignment test',
  description: null,
  status: 'Todo',
  priority: 'Medium',
  categoryId: null,
  categoryName: null,
  createdByUserId: 'creator-1',
  createdBy: { id: 'creator-1', displayName: 'Creator' },
  assigneeUserId: null,
  assignee: null,
  assigneeName: null,
  legacyAssigneeName: null,
  permissions: denied,
  createdAtUtc: '2026-09-29T10:00:00Z',
  updatedAtUtc: '2026-09-29T10:00:00Z',
};
let auth: AuthContextValue;
let onAssign: (id: string | null) => Promise<void>;
let onRefresh: () => void;

function component(current: WorkItem = item, isMutating = false) {
  return (
    <AuthContext.Provider value={auth}>
      <WorkItemAssignment
        key={current.id}
        item={current}
        isMutating={isMutating}
        onAssign={onAssign}
        onRefresh={onRefresh}
      />
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  auth = {
    user: {
      id: 'member-1',
      email: 'member@example.test',
      displayName: 'Member',
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
  onAssign = vi.fn().mockResolvedValue(undefined);
  onRefresh = vi.fn();
  vi.mocked(usersApi.list).mockResolvedValue([
    { id: 'member-1', displayName: 'Member' },
    { id: 'other-2', displayName: 'Sara' },
  ]);
});

describe('WorkItemAssignment', () => {
  it('fetches the safe user directory only after server-permitted assignment is opened', async () => {
    render(component({ ...item, permissions: admin }));
    expect(usersApi.list).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Assign to')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    const select = await screen.findByLabelText('Assign to');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Sara' })).toBeTruthy();
    expect(screen.queryByText('member@example.test')).toBeNull();
    expect(usersApi.list).toHaveBeenCalledTimes(1);
  });

  it('allows another user selection when server capabilities permit it even for a Member-labelled session', async () => {
    const user = userEvent.setup();
    render(component({ ...item, permissions: admin }));
    await user.click(screen.getByRole('button', { name: 'Change assignment' }));
    await user.selectOptions(await screen.findByLabelText('Assign to'), 'other-2');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(onAssign).toHaveBeenCalledWith('other-2');
    expect(onAssign).toHaveBeenCalledTimes(1);
  });

  it('uses an accessible native select and a keyboard-operable save action', async () => {
    const user = userEvent.setup();
    render(component({ ...item, permissions: admin }));
    await user.click(screen.getByRole('button', { name: 'Change assignment' }));
    const select = await screen.findByLabelText('Assign to');
    await user.tab();
    expect(document.activeElement).toBe(select);
    await user.selectOptions(select, 'other-2');
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Save assignment' })
    );
    await user.keyboard('{Enter}');
    expect(onAssign).toHaveBeenCalledWith('other-2');
  });

  it('offers Admin unassignment when the server permits it', async () => {
    render(
      component({
        ...item,
        permissions: admin,
        assigneeUserId: 'other-2',
        assignee: { id: 'other-2', displayName: 'Sara' },
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(onAssign).toHaveBeenCalledWith(null);
    expect(usersApi.list).not.toHaveBeenCalled();
  });

  it('self-assigns using only the authenticated user ID without opening a directory', async () => {
    render(
      component({
        ...item,
        permissions: { ...denied, canAssign: true, canSelfAssign: true },
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Assign to me' }));
    expect(onAssign).toHaveBeenCalledWith('member-1');
    expect(usersApi.list).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change assignment' })).toBeNull();
  });

  it('self-unassigns without offering arbitrary user assignment', async () => {
    render(
      component({
        ...item,
        permissions: { ...denied, canAssign: true, canUnassign: true },
        assigneeUserId: 'member-1',
        assignee: { id: 'member-1', displayName: 'Member' },
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Unassign me' }));
    expect(onAssign).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unassign' })).toBeNull();
    expect(usersApi.list).not.toHaveBeenCalled();
  });

  it.each([denied, null, { ...admin, canAssign: false }])(
    'fails closed with denied or missing server capabilities',
    (permissions) => {
      auth.user = { ...auth.user!, roles: ['Admin'] };
      render(
        component({
          ...item,
          permissions,
          assigneeUserId: 'member-1',
          assignee: { id: 'member-1', displayName: 'Member' },
        })
      );
      expect(screen.queryByRole('button', { name: 'Change assignment' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Unassign me' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Unassign' })).toBeNull();
      expect(usersApi.list).not.toHaveBeenCalled();
    }
  );

  it('does not grant assignment from a matching historical display name', () => {
    render(
      component({
        ...item,
        createdByUserId: null,
        createdBy: null,
        permissions: denied,
        assigneeName: 'Member',
        legacyAssigneeName: 'Member',
      })
    );
    expect(screen.getByText(/Historical assignment: Member/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull();
    expect(usersApi.list).not.toHaveBeenCalled();
  });

  it('lets server-permitted Admin assignment replace an unowned historical snapshot with a real user', async () => {
    const user = userEvent.setup();
    render(
      component({
        ...item,
        createdByUserId: null,
        createdBy: null,
        permissions: admin,
        legacyAssigneeName: 'Historical owner',
      })
    );
    expect(screen.getByText('Historical assignment: Historical owner')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Change assignment' }));
    await user.selectOptions(await screen.findByLabelText('Assign to'), 'other-2');
    await user.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(onAssign).toHaveBeenCalledWith('other-2');
  });

  it('keeps self-assignment disabled if no trusted current user ID is available', () => {
    auth.user = null;
    render(
      component({
        ...item,
        permissions: { ...denied, canAssign: true, canSelfAssign: true },
      })
    );
    const action = screen.getByRole('button', { name: 'Assign to me' });
    expect(action).toHaveProperty('disabled', true);
    fireEvent.click(action);
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('announces directory loading without hiding the assignment or work-item content', async () => {
    vi.mocked(usersApi.list).mockReturnValue(new Promise(() => undefined));
    render(component({ ...item, permissions: admin }));
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    expect(screen.getByRole('status').textContent).toContain('Loading users');
    expect(screen.queryByRole('button', { name: 'Save assignment' })).toBeNull();
  });

  it('shows an empty user directory without offering an invalid assignment', async () => {
    vi.mocked(usersApi.list).mockResolvedValue([]);
    render(component({ ...item, permissions: admin }));
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    expect(await screen.findByText(/No active users/)).toBeTruthy();
    const save = screen.queryByRole('button', { name: 'Save assignment' });
    expect(save === null || (save as HTMLButtonElement).disabled).toBe(true);
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('retries only a failed directory request and then makes its options available', async () => {
    vi.mocked(usersApi.list)
      .mockRejectedValueOnce(new ApiError('Directory unavailable', 0))
      .mockResolvedValueOnce([{ id: 'other-2', displayName: 'Sara' }]);
    render(component({ ...item, permissions: admin }));
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onAssign).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry user directory' }));
    expect(await screen.findByRole('option', { name: 'Sara' })).toBeTruthy();
    expect(usersApi.list).toHaveBeenCalledTimes(2);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('keeps forbidden assignment errors visible without logging out or refreshing', async () => {
    vi.mocked(onAssign).mockRejectedValue(
      new ApiError('You do not have permission to perform this action.', 403)
    );
    render(
      component({
        ...item,
        permissions: { ...denied, canAssign: true, canSelfAssign: true },
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Assign to me' }));
    expect((await screen.findByRole('alert')).textContent).toContain('permission');
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(auth.user?.id).toBe('member-1');
  });

  it('shows concurrency guidance and refreshes only when explicitly requested', async () => {
    vi.mocked(onAssign).mockRejectedValue(
      new ApiError(
        'This work item was modified by another request. Refresh it and try again.',
        409,
        { title: 'Work Item Concurrency Conflict' }
      )
    );
    render(
      component({
        ...item,
        permissions: { ...denied, canAssign: true, canSelfAssign: true },
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Assign to me' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Refresh');
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onAssign).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh work item' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledTimes(1);
  });

  it('guards rapid assignment actions while the request is pending', () => {
    vi.mocked(onAssign).mockReturnValue(new Promise(() => undefined));
    render(
      component({
        ...item,
        permissions: { ...denied, canAssign: true, canSelfAssign: true },
      })
    );
    const action = screen.getByRole('button', { name: 'Assign to me' });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(action).toHaveProperty('disabled', true);
  });

  it('disables assignment actions while another work-item mutation is pending', () => {
    render(
      component(
        { ...item, permissions: { ...denied, canAssign: true, canSelfAssign: true } },
        true
      )
    );
    const action = screen.getByRole('button', { name: 'Assign to me' });
    expect(action).toHaveProperty('disabled', true);
    fireEvent.click(action);
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('discards late user-directory results after switching the work item', async () => {
    let resolveOld: ((users: { id: string; displayName: string }[]) => void) | undefined;
    vi.mocked(usersApi.list)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve;
        })
      )
      .mockResolvedValueOnce([{ id: 'new-user', displayName: 'New directory user' }]);
    const view = render(component({ ...item, permissions: admin }));
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    view.rerender(component({ ...item, id: 'item-2', permissions: admin }));
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    await screen.findByRole('option', { name: 'New directory user' });
    await act(async () =>
      resolveOld?.([{ id: 'old-user', displayName: 'Old directory user' }])
    );
    expect(screen.queryByRole('option', { name: 'Old directory user' })).toBeNull();
    expect(screen.getByRole('option', { name: 'New directory user' })).toBeTruthy();
  });

  it('does not show a previous item directory failure after switching to a new item', async () => {
    let rejectOld: ((error: unknown) => void) | undefined;
    vi.mocked(usersApi.list)
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOld = reject;
        })
      )
      .mockResolvedValueOnce([{ id: 'new-user', displayName: 'New directory user' }]);
    const view = render(component({ ...item, permissions: admin }));
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    view.rerender(component({ ...item, id: 'item-2', permissions: admin }));
    await userEvent.click(screen.getByRole('button', { name: 'Change assignment' }));
    await screen.findByRole('option', { name: 'New directory user' });
    await act(async () => rejectOld?.(new ApiError('Old directory failed', 0)));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('option', { name: 'New directory user' })).toBeTruthy();
  });
});
