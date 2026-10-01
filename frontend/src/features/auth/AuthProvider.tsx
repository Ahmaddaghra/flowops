import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { authSession } from '@/lib/authSession';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/types/api';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '@/types/auth';
import { AuthContext } from './context';

interface Hydration {
  revision: number;
  user: AuthUser | null;
  error: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydration, setHydration] = useState<Hydration>(() => {
    authSession.restore();
    return { revision: -1, user: null, error: null };
  });
  const session = useSyncExternalStore(authSession.subscribe, authSession.getSnapshot);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(false);
  const authOperation = useRef(0);
  const user =
    session.accessToken && hydration.revision === session.revision
      ? hydration.user
      : null;
  const initializationError =
    session.accessToken && hydration.revision === session.revision
      ? hydration.error
      : null;

  useEffect(() => {
    mounted.current = true;
    const operationCounter = authOperation;
    return () => {
      mounted.current = false;
      operationCounter.current++;
    };
  }, []);

  useEffect(() => {
    if (!session.accessToken || user) return;
    let active = true;
    const revision = session.revision;
    authApi
      .me()
      .then((currentUser) => {
        if (active && authSession.getSnapshot().revision === revision) {
          setHydration({ revision, user: currentUser, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!active || authSession.getSnapshot().revision !== revision) return;
        if (error instanceof ApiError && error.status === 401) {
          authSession.invalidateIfCurrent(session);
          return;
        }
        setHydration({
          revision,
          user: null,
          error: 'Unable to restore your session. Please try again.',
        });
      });
    return () => {
      active = false;
    };
  }, [session, user, retry]);

  const establish = useCallback(async (request: () => Promise<AuthResponse>) => {
    const revision = authSession.getSnapshot().revision;
    const operation = ++authOperation.current;
    const response = await request();
    if (
      !mounted.current ||
      operation !== authOperation.current ||
      revision !== authSession.getSnapshot().revision
    ) {
      throw new ApiError('This sign-in attempt was cancelled. Please try again.', 0);
    }
    authSession.setSession(response);
    setHydration({
      revision: authSession.getSnapshot().revision,
      user: response.user,
      error: null,
    });
  }, []);

  const login = useCallback(
    (request: LoginRequest) => establish(() => authApi.login(request)),
    [establish]
  );
  const register = useCallback(
    (request: RegisterRequest) => establish(() => authApi.register(request)),
    [establish]
  );
  const logout = useCallback(() => {
    authOperation.current++;
    authSession.clear();
  }, []);
  const retryInitialization = useCallback(() => {
    setHydration({
      revision: authSession.getSnapshot().revision,
      user: null,
      error: null,
    });
    setRetry((current) => current + 1);
  }, []);

  const value = useMemo(
    () => ({
      user,
      accessToken: session.accessToken,
      expiresAtUtc: session.expiresAtUtc,
      isAuthenticated: Boolean(user && session.accessToken),
      isInitializing: Boolean(session.accessToken && !user && !initializationError),
      initializationError,
      sessionExpired: session.expired,
      login,
      register,
      logout,
      retryInitialization,
    }),
    [user, session, initializationError, login, register, logout, retryInitialization]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
