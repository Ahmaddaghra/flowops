import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { authApi } from '@/lib/api/auth';
import { authSession, AUTH_TOKEN_KEY, AUTH_EXPIRY_KEY } from '@/lib/authSession';
import { ApiError } from '@/types/api';
import type { AuthResponse, AuthUser } from '@/types/auth';

vi.mock('@/lib/api/auth', () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn() },
}));
const user: AuthUser = {
  id: 'member-id',
  email: 'member@example.test',
  displayName: 'Test Member',
  roles: ['Member'],
};
const response: AuthResponse = {
  accessToken: 'test-session',
  expiresAtUtc: '2030-01-01T00:00:00Z',
  user,
};
let current!: ReturnType<typeof useAuth>;

function Probe() {
  current = useAuth();
  return (
    <div>
      {current.isInitializing
        ? 'Initializing'
        : current.initializationError || current.user?.displayName || 'Anonymous'}
    </div>
  );
}
function mount(strict = false) {
  const contents = (
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  return render(strict ? <StrictMode>{contents}</StrictMode> : contents);
}
function persistedSession() {
  sessionStorage.setItem(AUTH_TOKEN_KEY, response.accessToken);
  sessionStorage.setItem(AUTH_EXPIRY_KEY, response.expiresAtUtc);
}
beforeEach(() => {
  authSession.clear();
  sessionStorage.clear();
  vi.resetAllMocks();
});
afterEach(() => {
  authSession.clear();
  sessionStorage.clear();
});

describe('AuthProvider', () => {
  it('starts anonymous without making a /me call when no token exists', () => {
    mount();
    expect(screen.getByText('Anonymous')).toBeDefined();
    expect(current.isAuthenticated).toBe(false);
    expect(authApi.me).not.toHaveBeenCalled();
  });

  it('blocks initialization until the authoritative /me user arrives', async () => {
    persistedSession();
    let complete!: (value: AuthUser) => void;
    vi.mocked(authApi.me).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    mount();
    expect(screen.getByText('Initializing')).toBeDefined();
    expect(current.user).toBeNull();
    await act(async () => {
      complete(user);
    });
    expect(screen.getByText(user.displayName)).toBeDefined();
    expect(current.isAuthenticated).toBe(true);
  });

  it('clears an invalid bootstrap session on /me 401', async () => {
    persistedSession();
    vi.mocked(authApi.me).mockRejectedValue(new ApiError('Unauthorized', 401));
    mount();
    await screen.findByText('Anonymous');
    expect(current.sessionExpired).toBe(true);
    expect(current.user).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it.each([0, 500])(
    'retains the token on bootstrap failure %s and supports retry',
    async (status) => {
      persistedSession();
      vi.mocked(authApi.me)
        .mockRejectedValueOnce(new ApiError('Connection failed', status))
        .mockResolvedValueOnce(user);
      mount();
      await screen.findByText('Unable to restore your session. Please try again.');
      expect(current.isAuthenticated).toBe(false);
      expect(current.sessionExpired).toBe(false);
      expect(authSession.getToken()).toBe(response.accessToken);
      act(() => current.retryInitialization());
      await screen.findByText(user.displayName);
      expect(current.isAuthenticated).toBe(true);
    }
  );

  it.each(['login', 'register'] as const)(
    '%s consumes the token response and logout clears the user and storage',
    async (method) => {
      vi.mocked(authApi[method]).mockResolvedValue(response);
      mount();
      await act(async () => {
        await current[method]({
          email: user.email,
          password: 'TestPass1',
          displayName: user.displayName,
        });
      });
      expect(current.user).toEqual(user);
      expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe(response.accessToken);
      expect(authApi.me).not.toHaveBeenCalled();
      act(() => current.logout());
      expect(current.user).toBeNull();
      expect(current.isAuthenticated).toBe(false);
      expect(sessionStorage.length).toBe(0);
    }
  );

  it('ignores a /me response that arrives after logout', async () => {
    persistedSession();
    let complete!: (value: AuthUser) => void;
    vi.mocked(authApi.me).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    mount();
    act(() => current.logout());
    await act(async () => {
      complete(user);
    });
    expect(current.user).toBeNull();
    expect(authSession.getToken()).toBeNull();
  });

  it('does not resurrect a login that completes after logout', async () => {
    let complete!: (value: AuthResponse) => void;
    vi.mocked(authApi.login).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    mount();
    const login = current.login({ email: user.email, password: 'TestPass1' });
    const rejection = expect(login).rejects.toMatchObject({ status: 0 });
    act(() => current.logout());
    complete(response);
    await rejection;
    expect(current.user).toBeNull();
    expect(authSession.getToken()).toBeNull();
  });

  it('keeps a new identity when an old account bootstrap finishes late', async () => {
    persistedSession();
    let complete!: (value: AuthUser) => void;
    vi.mocked(authApi.me).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const newResponse = {
      ...response,
      accessToken: 'new-session',
      user: { ...user, id: 'new-member', displayName: 'New Member' },
    };
    vi.mocked(authApi.login).mockResolvedValue(newResponse);
    mount();
    await act(async () => {
      await current.login({ email: user.email, password: 'TestPass1' });
    });
    await act(async () => {
      complete(user);
    });
    expect(current.user).toEqual(newResponse.user);
    expect(authSession.getToken()).toBe('new-session');
  });

  it('keeps the newer successful attempt when an older auth attempt finishes late', async () => {
    let completeOld!: (value: AuthResponse) => void;
    vi.mocked(authApi.login).mockReturnValue(
      new Promise((resolve) => {
        completeOld = resolve;
      })
    );
    const newResponse = {
      ...response,
      accessToken: 'new-session',
      user: { ...user, id: 'new-member', displayName: 'New Member' },
    };
    vi.mocked(authApi.register).mockResolvedValue(newResponse);
    mount();
    const oldLogin = current.login({ email: user.email, password: 'TestPass1' });
    const cancelled = expect(oldLogin).rejects.toMatchObject({ status: 0 });
    await act(async () => {
      await current.register({
        email: user.email,
        password: 'TestPass1',
        displayName: 'New Member',
      });
    });
    completeOld(response);
    await cancelled;
    expect(current.user).toEqual(newResponse.user);
    expect(authSession.getToken()).toBe('new-session');
  });

  it('hydrates safely under StrictMode effect replay', async () => {
    persistedSession();
    vi.mocked(authApi.me).mockResolvedValue(user);
    mount(true);
    await waitFor(() => expect(current.isAuthenticated).toBe(true));
    expect(current.user).toEqual(user);
  });
});
