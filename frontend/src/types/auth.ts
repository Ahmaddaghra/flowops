export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  expiresAtUtc: string;
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  displayName: string;
}
