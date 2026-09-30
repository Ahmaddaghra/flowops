import type { AuthResponse } from '@/types/auth';

export const AUTH_TOKEN_KEY = 'flowops.auth.token';
export const AUTH_EXPIRY_KEY = 'flowops.auth.expiresAt';

export interface AuthSessionSnapshot {
  accessToken: string | null;
  expiresAtUtc: string | null;
  revision: number;
  expired: boolean;
}

let snapshot: AuthSessionSnapshot = {
  accessToken: null,
  expiresAtUtc: null,
  revision: 0,
  expired: false,
};
let initialized = false;
const listeners = new Set<() => void>();

function publish(next: Omit<AuthSessionSnapshot, 'revision'>) {
  snapshot = { ...next, revision: snapshot.revision + 1 };
  listeners.forEach((listener) => listener());
}

function removeStoredSession() {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_EXPIRY_KEY);
  } catch {
    // Authentication can still run in memory when browser storage is unavailable.
  }
}

export const authSession = {
  restore() {
    initialized = true;
    try {
      const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || null;
      const expiry = token ? sessionStorage.getItem(AUTH_EXPIRY_KEY) || null : null;
      if (token !== snapshot.accessToken || expiry !== snapshot.expiresAtUtc) {
        publish({ accessToken: token, expiresAtUtc: expiry, expired: false });
      }
    } catch {
      // A storage failure does not invalidate a live in-memory session.
    }
  },
  getSnapshot(): AuthSessionSnapshot {
    if (!initialized) authSession.restore();
    return snapshot;
  },
  getToken(): string | null {
    return authSession.getSnapshot().accessToken;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setSession(session: Pick<AuthResponse, 'accessToken' | 'expiresAtUtc'>) {
    initialized = true;
    try {
      sessionStorage.setItem(AUTH_TOKEN_KEY, session.accessToken);
      sessionStorage.setItem(AUTH_EXPIRY_KEY, session.expiresAtUtc);
    } catch {
      removeStoredSession();
    }
    publish({
      accessToken: session.accessToken,
      expiresAtUtc: session.expiresAtUtc,
      expired: false,
    });
  },
  clear(expired = false) {
    initialized = true;
    removeStoredSession();
    if (!snapshot.accessToken && !snapshot.expiresAtUtc && snapshot.expired === expired)
      return;
    publish({ accessToken: null, expiresAtUtc: null, expired });
  },
  invalidateIfCurrent(requestSession: AuthSessionSnapshot) {
    // A late 401 from an old account/request cannot destroy a newer login.
    if (
      requestSession.accessToken &&
      requestSession.revision === snapshot.revision &&
      requestSession.accessToken === snapshot.accessToken
    ) {
      authSession.clear(true);
    }
  },
};
