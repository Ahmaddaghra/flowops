import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../context';
import { ApiError } from '@/types/api';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

let auth: AuthContextValue;

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="destination">
      {location.pathname}
      {location.search}
      {location.hash}
    </span>
  );
}

function renderPage(page: 'login' | 'register', from?: string) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[{ pathname: `/${page}`, state: { from } }]}>
        <LocationProbe />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<p>Authenticated destination</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

async function fillLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'member@example.com');
  await user.type(screen.getByLabelText('Password'), 'TestPass123');
  return user;
}

async function fillRegister() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Display name'), 'Member name');
  await user.type(screen.getByLabelText('Email'), 'member@example.com');
  await user.type(screen.getByLabelText('Password'), 'TestPass123');
  await user.type(screen.getByLabelText('Confirm password'), 'TestPass123');
  return user;
}

beforeEach(() => {
  auth = {
    user: null,
    accessToken: null,
    expiresAtUtc: null,
    isAuthenticated: false,
    isInitializing: false,
    initializationError: null,
    sessionExpired: false,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    retryInitialization: vi.fn(),
  };
});

describe('LoginPage', () => {
  it('requires email and password, focuses the first invalid field, and does not submit', async () => {
    renderPage('login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Email is required.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling the API', async () => {
    renderPage('login');
    const user = await fillLogin();
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'invalid-address');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('submits credentials and returns to the intended protected location with query and hash', async () => {
    renderPage('login', '/work-items/item-1?tab=activity#history');
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.login).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'TestPass123',
    });
    expect(await screen.findByText('Authenticated destination')).toBeTruthy();
    expect(screen.getByTestId('destination').textContent).toBe(
      '/work-items/item-1?tab=activity#history'
    );
  });

  it('rejects an external return destination after sign in', async () => {
    renderPage('login', '//evil.example');
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Authenticated destination');
    expect(screen.getByTestId('destination').textContent).toBe('/work-items');
  });

  it('shows generic credential failure, keeps the form, and allows retry', async () => {
    vi.mocked(auth.login).mockRejectedValueOnce(new ApiError('Account not found', 401));
    renderPage('login');
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid email or password.'
    );
    expect(screen.queryByText('Account not found')).toBeNull();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'member@example.com'
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Authenticated destination');
    expect(auth.login).toHaveBeenCalledTimes(2);
  });

  it('distinguishes connection failures from invalid credentials', async () => {
    vi.mocked(auth.login).mockRejectedValue(new ApiError('Failed to fetch', 0));
    renderPage('login');
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Unable to connect to FlowOps. Check your connection and try again.'
    );
  });

  it('guards duplicate form submissions while login is pending', async () => {
    vi.mocked(auth.login).mockReturnValue(new Promise(() => undefined));
    renderPage('login');
    await fillLogin();
    const form = screen.getByRole('form', { name: 'Sign in' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('announces expired sessions and provides password-manager attributes', () => {
    auth.sessionExpired = true;
    renderPage('login');
    expect(screen.getByRole('status').textContent).toContain('Your session expired');
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe(
      'current-password'
    );
  });
});

describe('RegisterPage', () => {
  it('requires identity fields and password confirmation and focuses the first error', async () => {
    renderPage('register');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Display name is required.')).toBeTruthy();
    expect(screen.getByText('Email is required.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(screen.getByText('Confirm your password.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Display name'));
    expect(auth.register).not.toHaveBeenCalled();
  });

  it.each(['short1A', 'lowercase123', 'UPPERCASE123', 'NoNumbersHere'])(
    'rejects the weak password %s',
    async (password) => {
      renderPage('register');
      const user = await fillRegister();
      await user.clear(screen.getByLabelText('Password'));
      await user.type(screen.getByLabelText('Password'), password);
      await user.clear(screen.getByLabelText('Confirm password'));
      await user.type(screen.getByLabelText('Confirm password'), password);
      await user.click(screen.getByRole('button', { name: 'Create account' }));
      expect(
        screen.getByText(
          'Use at least 8 characters with uppercase, lowercase, and a number.'
        )
      ).toBeTruthy();
      expect(auth.register).not.toHaveBeenCalled();
    }
  );

  it('rejects mismatched password confirmation', async () => {
    renderPage('register');
    const user = await fillRegister();
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'Different123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Confirm password'));
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('registers with only trusted request fields and moves to work items', async () => {
    renderPage('register');
    const user = await fillRegister();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(auth.register).toHaveBeenCalledWith({
      displayName: 'Member name',
      email: 'member@example.com',
      password: 'TestPass123',
    });
    expect(screen.queryByRole('combobox')).toBeNull();
    await screen.findByText('Authenticated destination');
    expect(screen.getByTestId('destination').textContent).toBe('/work-items');
  });

  it('maps server field errors case-insensitively and focuses the matching field after enabling inputs', async () => {
    vi.mocked(auth.register).mockRejectedValue(
      new ApiError('Validation failed', 400, {
        errors: { Email: ['An account with this email already exists.'] },
      })
    );
    renderPage('register');
    const user = await fillRegister();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('An account with this email already exists.')
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    );
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'member@example.com'
    );
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe(
      'new-password'
    );
  });

  it('guards duplicate registration submissions', async () => {
    vi.mocked(auth.register).mockReturnValue(new Promise(() => undefined));
    renderPage('register');
    await fillRegister();
    const form = screen.getByRole('form', { name: 'Create an account' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Creating account…' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
