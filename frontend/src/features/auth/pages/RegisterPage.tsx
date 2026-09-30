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

export function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  function clearError(name: string) {
    setErrors((current) => ({ ...current, [name]: '' }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const nextErrors: Record<string, string> = {};
    if (!displayName.trim()) nextErrors.displayname = 'Display name is required.';
    else if (displayName.trim().length > 100)
      nextErrors.displayname = 'Display name cannot exceed 100 characters.';
    const emailError = emailValidation(email);
    if (emailError) nextErrors.email = emailError;
    if (!password) nextErrors.password = 'Password is required.';
    else if (password.length > 128)
      nextErrors.password = 'Password cannot exceed 128 characters.';
    else if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    )
      nextErrors.password =
        'Use at least 8 characters with uppercase, lowercase, and a number.';
    if (!confirmPassword) nextErrors.confirmpassword = 'Confirm your password.';
    else if (confirmPassword !== password)
      nextErrors.confirmpassword = 'Passwords do not match.';
    shouldFocusErrors.current = true;
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length) {
      return;
    }

    pending.current = true;
    setIsSubmitting(true);
    try {
      await register({ displayName: displayName.trim(), email: email.trim(), password });
      navigate(returnPathFromState(location.state), { replace: true });
    } catch (error) {
      const serverErrors = authFieldErrors(error);
      shouldFocusErrors.current = true;
      setErrors(serverErrors);
      setSubmitError(authErrorMessage(error, 'register'));
    } finally {
      pending.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Create an account
      </h1>
      <p className="mt-2 mb-6 text-sm text-slate-500">
        Join your team as a FlowOps member.
      </p>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
        aria-label="Create an account"
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
          label="Display name"
          name="displayname"
          autoComplete="name"
          required
          maxLength={100}
          value={displayName}
          error={errors.displayname}
          disabled={isSubmitting}
          onChange={(event) => {
            setDisplayName(event.target.value);
            clearError('displayname');
          }}
        />
        <Input
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
            clearError('email');
          }}
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={password}
          error={errors.password}
          hint="At least 8 characters with uppercase, lowercase, and a number."
          disabled={isSubmitting}
          onChange={(event) => {
            setPassword(event.target.value);
            clearError('password');
            clearError('confirmpassword');
          }}
        />
        <Input
          label="Confirm password"
          name="confirmpassword"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirmPassword}
          error={errors.confirmpassword}
          disabled={isSubmitting}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            clearError('confirmpassword');
          }}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          to="/login"
          state={location.state}
          className="font-medium text-indigo-700 hover:text-indigo-900 underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
