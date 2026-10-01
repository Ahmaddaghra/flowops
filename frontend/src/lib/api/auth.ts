import { apiClient } from './client';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '@/types/auth';

export const authApi = {
  login: (request: LoginRequest): Promise<AuthResponse> =>
    apiClient('/auth/login', {
      method: 'POST',
      body: JSON.stringify(request),
      auth: false,
    }),
  register: (request: RegisterRequest): Promise<AuthResponse> =>
    apiClient('/auth/register', {
      method: 'POST',
      body: JSON.stringify(request),
      auth: false,
    }),
  me: (): Promise<AuthUser> => apiClient('/auth/me'),
};
