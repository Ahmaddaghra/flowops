import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workItemsApi } from '@/lib/api/workItems';
import { ApiError } from '@/types/api';
import { WorkItemComment } from '@/types/workItems';
import { formatDate } from '@/lib/utils';
import { WorkItemComments } from './WorkItemComments';

vi.mock('@/lib/api/workItems', () => ({
  workItemsApi: { getComments: vi.fn(), addComment: vi.fn() },
}));

const first: WorkItemComment = {
  id: 'comment-a',
  workItemId: 'item-1',
  body: 'First line\nSecond line',
  createdAtUtc: '2026-09-30T10:00:00Z',
  author: { id: 'member-1', displayName: 'Member One' },
};
const second: WorkItemComment = {
  ...first,
  id: 'comment-b',
  body: 'Follow-up investigation',
  createdAtUtc: '2026-09-30T11:00:00Z',
  author: { id: 'member-2', displayName: 'Member Two' },
};
const added = {
  ...second,
  id: 'comment-c',
  body: 'Added update',
  createdAtUtc: '2026-09-30T12:00:00Z',
};
const refreshActivity = vi.fn();
const renderComments = () =>
  render(
    <WorkItemComments key="item-1" workItemId="item-1" onCommentAdded={refreshActivity} />
  );
const textarea = () => screen.getByRole('textbox', { name: 'Add a comment' });
const submit = () => screen.getByRole('button', { name: 'Add comment' });

beforeEach(() => {
  vi.mocked(workItemsApi.getComments).mockReset().mockResolvedValue([]);
  vi.mocked(workItemsApi.addComment).mockReset().mockResolvedValue(added);
  refreshActivity.mockReset();
});

describe('WorkItemComments', () => {
  it('shows isolated loading and keeps the labelled form available', () => {
    vi.mocked(workItemsApi.getComments).mockReturnValue(new Promise(() => undefined));
    renderComments();
    expect(screen.getByRole('status').textContent).toBe('Loading comments…');
    expect(textarea()).toBeTruthy();
    expect(submit()).toHaveProperty('disabled', false);
    expect(screen.queryByText('No comments yet.')).toBeNull();
  });

  it('shows the empty state after a successful empty list', async () => {
    renderComments();
    expect(await screen.findByText('No comments yet.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(workItemsApi.getComments).toHaveBeenCalledWith('item-1');
  });

  it('renders author, timestamp and multiline plain text in oldest-first order', async () => {
    vi.mocked(workItemsApi.getComments).mockResolvedValue([second, first]);
    renderComments();
    const list = await screen.findByRole('list', {
      name: 'Work item comments, oldest first',
    });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(first.body),
      expect.stringContaining(second.body),
    ]);
    expect(within(rows[0]).getByText(first.author.displayName)).toBeTruthy();
    expect(
      within(rows[0]).getByText(formatDate(first.createdAtUtc)).getAttribute('datetime')
    ).toBe(first.createdAtUtc);
    expect(rows[0].querySelector('p:last-child')?.className).toContain(
      'whitespace-pre-wrap'
    );
    expect(rows[0].querySelector('p:last-child')?.className).toContain('break-words');
  });

  it('uses comment ID to break equal timestamp ties deterministically', async () => {
    vi.mocked(workItemsApi.getComments).mockResolvedValue([
      { ...second, createdAtUtc: first.createdAtUtc },
      first,
    ]);
    renderComments();
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain(first.body);
  });

  it('preserves timestamp order when comments share a millisecond but differ in database precision', async () => {
    vi.mocked(workItemsApi.getComments).mockResolvedValue([
      { ...first, createdAtUtc: '2026-09-30T10:00:00.123456Z' },
      { ...second, createdAtUtc: '2026-09-30T10:00:00.123Z' },
    ]);
    renderComments();
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain(second.body);
  });

  it('renders HTML-looking bodies as text and supports the safe unavailable-author fallback', async () => {
    const body = '<img src=x onerror=alert(1)>\n' + 'longword'.repeat(200);
    vi.mocked(workItemsApi.getComments).mockResolvedValue([
      { ...first, body, author: { id: 'missing-user', displayName: 'User unavailable' } },
    ]);
    const view = renderComments();
    await screen.findByText('User unavailable');
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('ol li p:last-child')?.textContent).toBe(body);
  });

  it('shows a local list failure and retries without removing the form', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.getComments)
      .mockRejectedValueOnce(new Error('Comments offline.'))
      .mockResolvedValueOnce([first]);
    renderComments();
    expect((await screen.findByRole('alert')).textContent).toBe('Comments offline.');
    expect(textarea()).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry comments' }));
    await screen.findByRole('list');
    expect(workItemsApi.getComments).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['', '   \n\t'])(
    'rejects a blank body locally and associates the announced error',
    async (body) => {
      const user = userEvent.setup();
      renderComments();
      await screen.findByText('No comments yet.');
      fireEvent.change(textarea(), { target: { value: body } });
      await user.click(submit());
      const error = screen.getByRole('alert');
      expect(error.textContent).toBe('Comment is required.');
      expect(textarea().getAttribute('aria-invalid')).toBe('true');
      expect(textarea().getAttribute('aria-describedby')).toContain(error.id);
      expect(workItemsApi.addComment).not.toHaveBeenCalled();
    }
  );

  it('sets maxlength and rejects over-limit input before sending', async () => {
    const user = userEvent.setup();
    renderComments();
    await screen.findByText('No comments yet.');
    expect(textarea().getAttribute('maxlength')).toBe('2000');
    fireEvent.change(textarea(), { target: { value: 'x'.repeat(2001) } });
    await user.click(submit());
    expect(screen.getByRole('alert').textContent).toBe(
      'Comment cannot exceed 2000 characters.'
    );
    expect(workItemsApi.addComment).not.toHaveBeenCalled();
  });

  it('submits trimmed body only, appends the returned comment, clears text and refreshes activity', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.getComments).mockResolvedValue([first]);
    renderComments();
    await screen.findByRole('list');
    await user.type(textarea(), '  Added update  ');
    await user.click(submit());
    expect(workItemsApi.addComment).toHaveBeenCalledWith('item-1', {
      body: 'Added update',
    });
    expect(await screen.findByText(added.body)).toBeTruthy();
    expect(textarea()).toHaveProperty('value', '');
    expect(refreshActivity).toHaveBeenCalledTimes(1);
    expect(workItemsApi.getComments).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('accepts exactly 2000 characters', async () => {
    renderComments();
    await screen.findByText('No comments yet.');
    fireEvent.change(textarea(), { target: { value: 'x'.repeat(2000) } });
    fireEvent.submit(textarea().closest('form')!);
    await waitFor(() =>
      expect(workItemsApi.addComment).toHaveBeenCalledWith('item-1', {
        body: 'x'.repeat(2000),
      })
    );
  });

  it('keeps the draft and shows field validation returned by the server', async () => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.addComment).mockRejectedValue(
      new ApiError('Validation failed.', 400, {
        errors: { Body: ['Review this comment.'] },
      })
    );
    renderComments();
    await screen.findByText('No comments yet.');
    await user.type(textarea(), 'Keep this draft');
    await user.click(submit());
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Review this comment.');
    expect(textarea()).toHaveProperty('value', 'Keep this draft');
    expect(textarea().getAttribute('aria-describedby')).toContain(error.id);
    expect(refreshActivity).not.toHaveBeenCalled();
    await user.type(textarea(), ' revised');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(textarea().getAttribute('aria-invalid')).toBe('false');
  });

  it.each([
    new Error('Connection lost.'),
    new ApiError('Not found.', 404, { detail: 'Work item was not found.' }),
    new ApiError('Forbidden.', 403, { detail: 'You cannot add comments here.' }),
  ])('keeps text and the form available after a failed POST: %s', async (failure) => {
    const user = userEvent.setup();
    vi.mocked(workItemsApi.addComment).mockRejectedValue(failure);
    renderComments();
    await screen.findByText('No comments yet.');
    await user.type(textarea(), 'Draft survives');
    await user.click(submit());
    expect((await screen.findByRole('alert')).textContent).toBe(
      failure instanceof ApiError ? failure.problemDetails?.detail : failure.message
    );
    expect(textarea()).toHaveProperty('value', 'Draft survives');
    expect(submit()).toHaveProperty('disabled', false);
    expect(refreshActivity).not.toHaveBeenCalled();
  });

  it('uses a synchronous guard to prevent duplicate POSTs and announces pending state', async () => {
    let finish!: (comment: WorkItemComment) => void;
    vi.mocked(workItemsApi.addComment).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderComments();
    await screen.findByText('No comments yet.');
    fireEvent.change(textarea(), { target: { value: 'Only once' } });
    const form = textarea().closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(workItemsApi.addComment).toHaveBeenCalledTimes(1);
    expect(submit()).toHaveProperty('disabled', true);
    expect(textarea()).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent).toBe('Adding comment…');
    await act(async () => finish(added));
    expect(submit()).toHaveProperty('disabled', false);
  });

  it('supports textarea Tab then Enter keyboard submission', async () => {
    const user = userEvent.setup();
    renderComments();
    await screen.findByText('No comments yet.');
    textarea().focus();
    await user.keyboard('Keyboard update');
    await user.tab();
    expect(document.activeElement).toBe(submit());
    await user.keyboard('{Enter}');
    await screen.findByText(added.body);
    expect(workItemsApi.addComment).toHaveBeenCalledWith('item-1', {
      body: 'Keyboard update',
    });
  });

  it('preserves a successful POST if an earlier list request resolves with an older snapshot', async () => {
    let finishList!: (comments: WorkItemComment[]) => void;
    vi.mocked(workItemsApi.getComments).mockReturnValue(
      new Promise((resolve) => {
        finishList = resolve;
      })
    );
    renderComments();
    fireEvent.change(textarea(), { target: { value: added.body } });
    fireEvent.submit(textarea().closest('form')!);
    await screen.findByText(added.body);
    await act(async () => finishList([first]));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(added.body)).toBeTruthy();
  });

  it('deduplicates returned comments when a pending GET already contains the successful POST', async () => {
    let finishList!: (comments: WorkItemComment[]) => void;
    vi.mocked(workItemsApi.getComments).mockReturnValue(
      new Promise((resolve) => {
        finishList = resolve;
      })
    );
    renderComments();
    fireEvent.change(textarea(), { target: { value: added.body } });
    fireEvent.submit(textarea().closest('form')!);
    await screen.findByText(added.body);
    await act(async () => finishList([first, added]));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
  });

  it.each([false, true])(
    'ignores late list responses/errors after a keyed item change (error: %s)',
    async (fails) => {
      let finish!: (comments: WorkItemComment[]) => void;
      let fail!: (reason: Error) => void;
      vi.mocked(workItemsApi.getComments)
        .mockReturnValueOnce(
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          })
        )
        .mockResolvedValueOnce([{ ...second, workItemId: 'item-2' }]);
      const view = renderComments();
      expect(screen.getByText('Loading comments…')).toBeTruthy();
      view.rerender(
        <WorkItemComments
          key="item-2"
          workItemId="item-2"
          onCommentAdded={refreshActivity}
        />
      );
      await screen.findByText(second.body);
      fireEvent.change(textarea(), { target: { value: 'New route draft' } });
      await act(async () => {
        if (fails) fail(new Error('Old route failed.'));
        else finish([first]);
      });
      expect(screen.queryByText('Old route failed.')).toBeNull();
      expect(screen.queryByText(first.body)).toBeNull();
      expect(screen.getByText(second.body)).toBeTruthy();
      expect(textarea()).toHaveProperty('value', 'New route draft');
      expect(screen.queryByRole('status')).toBeNull();
    }
  );

  it.each([false, true])(
    'ignores late submit success/error after a keyed item change (error: %s)',
    async (fails) => {
      let finish!: (comment: WorkItemComment) => void;
      let fail!: (reason: Error) => void;
      vi.mocked(workItemsApi.addComment).mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finish = resolve;
          fail = reject;
        })
      );
      const view = renderComments();
      await screen.findByText('No comments yet.');
      fireEvent.change(textarea(), { target: { value: 'Old route post' } });
      fireEvent.submit(textarea().closest('form')!);
      view.rerender(
        <WorkItemComments
          key="item-2"
          workItemId="item-2"
          onCommentAdded={refreshActivity}
        />
      );
      await screen.findByText('No comments yet.');
      fireEvent.change(textarea(), { target: { value: 'New route draft' } });
      await act(async () => {
        if (fails) fail(new Error('Old post failed.'));
        else finish(added);
      });
      expect(screen.queryByText(added.body)).toBeNull();
      expect(screen.queryByText('Old post failed.')).toBeNull();
      expect(textarea()).toHaveProperty('value', 'New route draft');
      expect(submit()).toHaveProperty('disabled', false);
      expect(refreshActivity).not.toHaveBeenCalled();
    }
  );

  it('ignores an old retry error after the next work item loads', async () => {
    const user = userEvent.setup();
    let fail!: (reason: Error) => void;
    vi.mocked(workItemsApi.getComments)
      .mockRejectedValueOnce(new Error('Initial failure'))
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          fail = reject;
        })
      )
      .mockResolvedValueOnce([second]);
    const view = renderComments();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Retry comments' }));
    view.rerender(
      <WorkItemComments
        key="item-2"
        workItemId="item-2"
        onCommentAdded={refreshActivity}
      />
    );
    await screen.findByText(second.body);
    await act(async () => fail(new Error('Old retry failed.')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(second.body)).toBeTruthy();
  });
});
