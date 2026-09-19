import { ApiError, ProblemDetails } from '@/types/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  const defaultHeaders: HeadersInit = {
    Accept: 'application/json',
  };

  if (options.body && typeof options.body === 'string') {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let problemDetails: ProblemDetails | undefined;
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;

      try {
        const errorJson = await response.json();
        problemDetails = errorJson as ProblemDetails;
        if (problemDetails.detail) {
          errorMessage = problemDetails.detail;
        } else if (problemDetails.title) {
          errorMessage = problemDetails.title;
        }
      } catch {
        // Fall back to default error message if response is not JSON
      }

      throw new ApiError(errorMessage, response.status, problemDetails);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      err instanceof Error ? err.message : 'Unable to connect to the FlowOps API server.',
      0
    );
  }
}
