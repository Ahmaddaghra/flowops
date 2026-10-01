import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authSession, AUTH_EXPIRY_KEY, AUTH_TOKEN_KEY } from '@/lib/authSession';
import { WorkItemComment } from '@/types/workItems';
import { workItemsApi } from './workItems';

const fetchMock = vi.fn<typeof fetch>();
const session = { accessToken: 'test-session', expiresAtUtc: '2030-01-01T00:00:00Z' };
const comment: WorkItemComment = {
  id: 'comment-1',
  workItemId: 'item-1',
  body: 'Investigation complete.',
  createdAtUtc: '2026-09-30T10:00:00Z',
  author: { id: 'member-1', displayName: 'Member One' },
};

beforeEach(() => {
  authSession.clear();
  authSession.setSession(session);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  authSession.clear();
  vi.unstubAllGlobals();
});

describe('work item comments API', () => {
  it('loads typed comments through the authenticated central client', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([comment])));
    expect(await workItemsApi.getComments(comment.workItemId)).toEqual([comment]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${window.location.origin}/api/v1/work-items/item-1/comments`);
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-session'
    );
    expect(options?.body).toBeUndefined();
  });

  it('posts only body and returns the safe comment response without expectedVersion', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(comment), { status: 201 }));
    const request = { body: comment.body, authorUserId: 'spoofed', expectedVersion: 7 };
    expect(await workItemsApi.addComment(comment.workItemId, request)).toEqual(comment);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${window.location.origin}/api/v1/work-items/item-1/comments`);
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ body: comment.body });
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-session'
    );
  });

  it.each(['getComments', 'addComment'] as const)(
    '%s uses central invalidation and clears both persisted keys after a 401',
    async (method) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Session expired.' }), { status: 401 })
      );
      await expect(
        workItemsApi[method](comment.workItemId, { body: comment.body })
      ).rejects.toMatchObject({ status: 401 });
      expect(authSession.getSnapshot()).toMatchObject({
        accessToken: null,
        expired: true,
      });
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(sessionStorage.getItem(AUTH_EXPIRY_KEY)).toBeNull();
    }
  );

  it.each(['getComments', 'addComment'] as const)(
    '%s retains the session and ProblemDetails after a 403',
    async (method) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Comments are forbidden.' }), {
          status: 403,
        })
      );
      await expect(
        workItemsApi[method](comment.workItemId, { body: comment.body })
      ).rejects.toMatchObject({
        status: 403,
        problemDetails: { detail: 'Comments are forbidden.' },
      });
      expect(authSession.getToken()).toBe(session.accessToken);
      expect(authSession.getSnapshot().expired).toBe(false);
    }
  );

  it('does not let a late comment 401 erase a newer authenticated session', async () => {
    let complete!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const request = workItemsApi.addComment(comment.workItemId, { body: comment.body });
    authSession.setSession({ ...session, accessToken: 'new-session' });
    complete(new Response('{}', { status: 401 }));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(authSession.getToken()).toBe('new-session');
  });
});
