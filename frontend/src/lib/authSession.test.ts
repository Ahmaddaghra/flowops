import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authSession, AUTH_TOKEN_KEY, AUTH_EXPIRY_KEY } from './authSession';

const session = { accessToken: 'test-session', expiresAtUtc: '2030-01-01T00:00:00Z' };
beforeEach(() => {
  authSession.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  authSession.clear();
  sessionStorage.clear();
});

describe('session store', () => {
  it('restores only token and expiry metadata from sessionStorage', () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, session.accessToken);
    sessionStorage.setItem(AUTH_EXPIRY_KEY, session.expiresAtUtc);
    authSession.restore();
    expect(authSession.getSnapshot()).toMatchObject(session);
    expect(Object.keys(sessionStorage).sort()).toEqual(
      [AUTH_EXPIRY_KEY, AUTH_TOKEN_KEY].sort()
    );
  });

  it('persists minimum session data and removes it on logout', () => {
    authSession.setSession(session);
    expect(sessionStorage.length).toBe(2);
    authSession.clear();
    expect(sessionStorage.length).toBe(0);
    expect(authSession.getSnapshot()).toMatchObject({
      accessToken: null,
      expiresAtUtc: null,
      expired: false,
    });
  });

  it('keeps a live in-memory session when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    authSession.setSession(session);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    authSession.restore();
    expect(authSession.getToken()).toBe(session.accessToken);
  });

  it('unsubscribes listeners and returns stable snapshots between changes', () => {
    const listener = vi.fn();
    const unsubscribe = authSession.subscribe(listener);
    const previous = authSession.getSnapshot();
    expect(authSession.getSnapshot()).toBe(previous);
    authSession.setSession(session);
    expect(authSession.getSnapshot()).not.toBe(previous);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    authSession.clear();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
