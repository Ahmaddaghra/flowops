import { createContext } from 'react';
import type { AuthUser, LoginRequest, RegisterRequest } from '@/types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  expiresAtUtc: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  initializationError: string | null;
  sessionExpired: boolean;
  login: (request: LoginRequest) => Promise<void>;
  register: (request: RegisterRequest) => Promise<void>;
  logout: () => void;
  retryInitialization: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
