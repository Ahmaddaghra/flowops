import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout } from '../components/AuthLayout';
import { useAuth } from '../useAuth';
import { returnPathFromState } from '../returnPath';
import {
  authErrorMessage,
  authFieldErrors,
  emailValidation,
  focusFirstInvalid,
} from '../formValidation';

export function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocusErrors = useRef(false);

  useEffect(() => {
    if (shouldFocusErrors.current && !isSubmitting && formRef.current) {
      focusFirstInvalid(formRef.current, errors);
      shouldFocusErrors.current = false;
    }
  }, [errors, isSubmitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const nextErrors: Record<string, string> = {};
    const emailError = emailValidation(email);
    if (emailError) nextErrors.email = emailError;
    if (!password) nextErrors.password = 'Password is required.';
    else if (password.length > 128)
      nextErrors.password = 'Password cannot exceed 128 characters.';
    shouldFocusErrors.current = true;
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length) {
      return;
    }

    pending.current = true;
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(returnPathFromState(location.state), { replace: true });
    } catch (error) {
      const serverErrors = authFieldErrors(error);
      shouldFocusErrors.current = true;
      setErrors(serverErrors);
      setSubmitError(authErrorMessage(error, 'login'));
    } finally {
      pending.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
      <p className="mt-2 mb-6 text-sm text-slate-500">
        Continue to your team's work items.
      </p>
      {sessionExpired && (
        <p role="status" className="mb-4 text-sm text-amber-800">
          Your session expired. Sign in again.
        </p>
      )}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
        aria-label="Sign in"
      >
        {submitError && (
          <p
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {submitError}
          </p>
        )}
        <Input
          autoFocus
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          value={email}
          error={errors.email}
          disabled={isSubmitting}
          onChange={(event) => {
            setEmail(event.target.value);
            setErrors((current) => ({ ...current, email: '' }));
          }}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          error={errors.password}
          disabled={isSubmitting}
          onChange={(event) => {
            setPassword(event.target.value);
            setErrors((current) => ({ ...current, password: '' }));
          }}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        New to FlowOps?{' '}
        <Link
          to="/register"
          state={location.state}
          className="font-medium text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
