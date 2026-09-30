import { ApiError, ProblemDetails } from '@/types/api';
import { authSession } from '@/lib/authSession';

export interface ApiRequestOptions extends RequestInit {
  /** Public credential/health calls neither attach a session nor invalidate it. */
  auth?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  const base = new URL(`${BASE_URL.replace(/\/$/, '')}/`, window.location.origin);
  const url = /^(https?:)?\/\//i.test(endpoint)
    ? new URL(endpoint, window.location.origin)
    : new URL(endpoint.replace(/^\//, ''), base);
  const trustedApi =
    base.origin === window.location.origin &&
    url.origin === window.location.origin &&
    !url.username &&
    !url.password &&
    (url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/')) &&
    (url.pathname.startsWith(base.pathname) ||
      url.pathname === base.pathname.slice(0, -1));
  const { auth = true, headers: requestHeaders, ...requestOptions } = options;
  const requestSession = authSession.getSnapshot();
  const headers = new Headers(requestHeaders);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  // The central client never forwards a bearer token to an external origin/path.
  headers.delete('Authorization');
  if (auth && trustedApi && requestSession.accessToken) {
    headers.set('Authorization', `Bearer ${requestSession.accessToken}`);
  }

  try {
    const response = await fetch(url.href, {
      ...requestOptions,
      headers,
      ...(auth && trustedApi ? { redirect: 'error' as const } : {}),
    });
    if (!response.ok) {
      if (response.status === 401 && auth && trustedApi) {
        authSession.invalidateIfCurrent(requestSession);
      }
      let problemDetails: ProblemDetails | undefined;
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        problemDetails = (await response.json()) as ProblemDetails;
        errorMessage = problemDetails.detail || problemDetails.title || errorMessage;
      } catch {
        // Non-JSON errors retain the safe HTTP status message.
      }
      throw new ApiError(errorMessage, response.status, problemDetails);
    }
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error
        ? error.message
        : 'Unable to connect to the FlowOps API server.',
      0
    );
  }
}
