import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '../useAuth';
import { returnPathFromState } from '../returnPath';
import { AuthLayout } from './AuthLayout';

function SessionInitialization() {
  const { isInitializing, initializationError, retryInitialization, logout } = useAuth();
  return (
    <AuthLayout>
      {isInitializing ? (
        <p role="status" className="text-center text-sm text-slate-600">
          Checking your session…
        </p>
      ) : (
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">
            Could not restore your session
          </h1>
          <p role="alert" className="text-sm text-slate-600">
            {initializationError}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={retryInitialization}>Try again</Button>
            <Button variant="outline" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isInitializing || auth.initializationError) return <SessionInitialization />;
  if (!auth.isAuthenticated)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  return <Outlet />;
}

export function PublicAuthRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isInitializing || auth.initializationError) return <SessionInitialization />;
  if (auth.isAuthenticated)
    return <Navigate to={returnPathFromState(location.state)} replace />;
  return <Outlet />;
}
