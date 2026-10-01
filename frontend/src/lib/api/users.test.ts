import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authSession } from '@/lib/authSession';
import { usersApi } from './users';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  authSession.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  authSession.clear();
  vi.unstubAllGlobals();
});

describe('user directory API', () => {
  it('requests safe user summaries through the protected central client', async () => {
    authSession.setSession({
      accessToken: 'test-session',
      expiresAtUtc: '2030-01-01T00:00:00Z',
    });
    const users = [{ id: 'member-1', displayName: 'Member One' }];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(users)));

    expect(await usersApi.list()).toEqual(users);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${window.location.origin}/api/v1/users`);
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-session'
    );
    expect(options?.body).toBeUndefined();
  });
});
