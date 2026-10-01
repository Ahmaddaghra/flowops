import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../context';
import { AppRoutes } from '@/routes';
import { Header } from '@/components/layout/Header';
import { createRef } from 'react';

vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: () => <Outlet /> }));
vi.mock('@/features/work-items/pages/WorkItemsPage', () => ({
  WorkItemsPage: () => <h1>Protected work items</h1>,
}));
vi.mock('@/features/work-items/pages/WorkItemDetailPage', () => ({
  WorkItemDetailPage: () => <h1>Protected detail</h1>,
}));
vi.mock('@/pages/SettingsPage', () => ({
  SettingsPage: () => <h1>Protected settings</h1>,
}));
vi.mock('@/pages/DashboardPage', () => ({
  DashboardPage: () => <h1>Protected dashboard</h1>,
}));

let auth: AuthContextValue;

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}|{JSON.stringify(location.state)}
    </span>
  );
}

function routeElement(initialEntry: string | { pathname: string; state: unknown }) {
  return (
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>
  );
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

describe('authentication route boundaries', () => {
  it.each(['/', '/work-items', '/work-items/item-1', '/settings', '/dashboard'])(
    'redirects an anonymous visitor from %s to login',
    async (path) => {
      render(routeElement(path));
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
      expect(screen.queryByText(/Protected/)).toBeNull();
      expect(screen.getByTestId('location').textContent).toContain('/login|');
      expect(screen.getByTestId('location').textContent).toContain(`"from":"${path}"`);
    }
  );

  it('retains the requested query and hash in the login destination state', async () => {
    render(routeElement('/work-items/item-1?view=activity#history'));
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.getByTestId('location').textContent).toContain(
      '"from":"/work-items/item-1?view=activity#history"'
    );
  });

  it.each([
    ['/work-items', 'Protected work items'],
    ['/work-items/item-1', 'Protected detail'],
    ['/settings', 'Protected settings'],
    ['/dashboard', 'Protected dashboard'],
  ])('renders %s with a trusted authenticated session', (path, heading) => {
    auth.isAuthenticated = true;
    render(routeElement(path));
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it.each(['/login', '/register'])(
    'redirects an authenticated user away from the public %s page',
    async (path) => {
      auth.isAuthenticated = true;
      render(routeElement(path));
      expect(
        await screen.findByRole('heading', { name: 'Protected work items' })
      ).toBeTruthy();
    }
  );

  it('uses a safe intended location when an authenticated user reaches a public page', async () => {
    auth.isAuthenticated = true;
    render(
      routeElement({
        pathname: '/login',
        state: { from: '/settings?tab=profile#details' },
      })
    );
    await screen.findByRole('heading', { name: 'Protected settings' });
    expect(screen.getByTestId('location').textContent).toContain(
      '/settings?tab=profile#details'
    );
  });

  it.each(['/work-items', '/login'])(
    'shows session initialization without protected or public content at %s',
    (path) => {
      auth.isInitializing = true;
      auth.isAuthenticated = true;
      render(routeElement(path));
      expect(screen.getByRole('status').textContent).toContain('Checking your session');
      expect(screen.queryByRole('heading', { name: 'Protected work items' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
    }
  );

  it('offers retry and explicit signout after a bootstrap connection failure', async () => {
    auth.initializationError = 'Unable to connect. Your session is still saved.';
    auth.accessToken = 'saved-session';
    render(routeElement('/work-items'));
    expect(screen.getByRole('alert').textContent).toContain(
      'Your session is still saved'
    );
    expect(screen.queryByRole('heading', { name: 'Protected work items' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(auth.retryInitialization).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});

describe('authenticated header', () => {
  it('shows the actual user and roles and keeps navigation and logout accessible', async () => {
    auth.user = {
      id: 'member-1',
      email: 'member@example.com',
      displayName: 'Member name',
      roles: ['Member'],
    };
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/work-items']}>
          <Header
            onOpenMobileNav={vi.fn()}
            mobileNavOpen={false}
            mobileNavTriggerRef={createRef<HTMLButtonElement>()}
            isBackendHealthy
          />
        </MemoryRouter>
      </AuthContext.Provider>
    );
    expect(screen.getByText('Member name')).toBeTruthy();
    expect(screen.getByText('Member')).toBeTruthy();
    const navigation = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(navigation.getAttribute('aria-haspopup')).toBe('dialog');
    expect(navigation.getAttribute('aria-controls')).toBe('mobile-navigation-dialog');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
