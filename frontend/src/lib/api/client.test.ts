import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { authApi } from './auth';
import { authSession, AUTH_EXPIRY_KEY, AUTH_TOKEN_KEY } from '@/lib/authSession';
import { ApiError } from '@/types/api';

const session = { accessToken: 'test-session', expiresAtUtc: '2030-01-01T00:00:00Z' };
const fetchMock = vi.fn<typeof fetch>();
const failure = (status: number) =>
  new Response(JSON.stringify({ detail: 'Request failed.' }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });

beforeEach(() => {
  authSession.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  authSession.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('central API authentication', () => {
  it('attaches the current bearer centrally and preserves Headers inputs', async () => {
    authSession.setSession(session);
    fetchMock.mockResolvedValue(new Response('{}'));
    await apiClient('/work-items', { headers: new Headers({ 'X-Request': 'test' }) });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${window.location.origin}/api/v1/work-items`);
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer test-session'
    );
    expect(new Headers(options?.headers).get('X-Request')).toBe('test');
    expect(options?.redirect).toBe('error');
  });

  it('sends no Authorization for an anonymous request', async () => {
    fetchMock.mockResolvedValue(new Response('{}'));
    await apiClient('/work-items');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(
      false
    );
  });

  it('keeps API scope restricted even when the base URL is misconfigured as root', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/');
    authSession.setSession(session);
    fetchMock.mockResolvedValue(failure(401));
    await expect(apiClient('/unrelated')).rejects.toMatchObject({ status: 401 });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(
      false
    );
    expect(authSession.getToken()).toBe(session.accessToken);
  });

  it('never forwards or invalidates auth when the configured API base is external', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://outside.example/api/v1');
    authSession.setSession(session);
    fetchMock.mockResolvedValue(failure(401));
    await expect(apiClient('/work-items')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://outside.example/api/v1/work-items');
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(
      false
    );
    expect(authSession.getToken()).toBe(session.accessToken);
  });

  it.each([
    'https://outside.example/api/v1/work-items',
    '//outside.example/api/v1/work-items',
    '../health',
  ])('does not attach or invalidate auth outside the API scope: %s', async (endpoint) => {
    authSession.setSession(session);
    fetchMock.mockResolvedValue(failure(401));
    await expect(
      apiClient(endpoint, { headers: { Authorization: 'Bearer manually-supplied' } })
    ).rejects.toMatchObject({ status: 401 });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(
      false
    );
    expect(authSession.getToken()).toBe(session.accessToken);
    expect(authSession.getSnapshot().expired).toBe(false);
  });

  it('clears both persisted keys on a protected 401', async () => {
    authSession.setSession(session);
    fetchMock.mockResolvedValue(failure(401));
    await expect(apiClient('/work-items')).rejects.toBeInstanceOf(ApiError);
    expect(authSession.getSnapshot()).toMatchObject({ accessToken: null, expired: true });
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_EXPIRY_KEY)).toBeNull();
  });

  it.each(['login', 'register'] as const)(
    '%s failures opt out of bearer and global expiry handling',
    async (method) => {
      authSession.setSession(session);
      fetchMock.mockResolvedValue(failure(401));
      await expect(
        authApi[method]({
          email: 'member@example.test',
          password: 'TestPass1',
          displayName: 'Member',
        })
      ).rejects.toMatchObject({ status: 401 });
      expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(
        false
      );
      expect(authSession.getToken()).toBe(session.accessToken);
      expect(authSession.getSnapshot().expired).toBe(false);
    }
  );

  it('keeps public health failures separate from authentication', async () => {
    authSession.setSession(session);
    fetchMock.mockResolvedValue(failure(401));
    await expect(apiClient('/health', { auth: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(authSession.getToken()).toBe(session.accessToken);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(
      false
    );
  });

  it('preserves the session and Problem Details on a 403', async () => {
    authSession.setSession(session);
    fetchMock.mockResolvedValue(failure(403));
    await expect(
      apiClient('/work-items/item', { method: 'PATCH' })
    ).rejects.toMatchObject({
      status: 403,
      problemDetails: { detail: 'Request failed.' },
    });
    expect(authSession.getToken()).toBe(session.accessToken);
  });

  it('does not let an old request 401 erase a newer login', async () => {
    authSession.setSession(session);
    let complete!: (value: Response) => void;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const request = apiClient('/work-items');
    authSession.setSession({ ...session, accessToken: 'new-session' });
    complete(failure(401));
    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(authSession.getToken()).toBe('new-session');
  });

  it('notifies once for concurrent protected 401 responses', async () => {
    authSession.setSession(session);
    const listeners = vi.fn();
    const unsubscribe = authSession.subscribe(listeners);
    fetchMock.mockResolvedValue(failure(401));
    await Promise.allSettled([apiClient('/work-items'), apiClient('/categories')]);
    expect(listeners).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
