import { ApiError } from '@/types/api';

export function emailValidation(email: string): string | undefined {
  if (!email.trim()) return 'Email is required.';
  if (email.trim().length > 254) return 'Email cannot exceed 254 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return 'Enter a valid email address.';
}

export function authFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const fields: Record<string, string> = {};
  for (const [name, messages] of Object.entries(error.problemDetails?.errors ?? {})) {
    const key = name.split(/[.$]/).at(-1)?.toLowerCase();
    if (key && messages[0]) fields[key] = messages[0];
  }
  return fields;
}

export function authErrorMessage(error: unknown, action: 'login' | 'register'): string {
  if (error instanceof ApiError) {
    if (error.status === 401 && action === 'login') return 'Invalid email or password.';
    if (error.status === 0)
      return 'Unable to connect to FlowOps. Check your connection and try again.';
    if (error.status === 400) return 'Please review your details and try again.';
  }
  return action === 'login'
    ? 'Could not sign in. Please try again.'
    : 'Could not create your account. Please try again.';
}

export function focusFirstInvalid(form: HTMLFormElement, errors: Record<string, string>) {
  const inputs = Array.from(form.elements).filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement
  );
  inputs.find((input) => Boolean(errors[input.name]))?.focus();
}
