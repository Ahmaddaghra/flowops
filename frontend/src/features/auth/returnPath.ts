const internalOrigin = 'https://flowops.invalid';

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return '/work-items';
  if (
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return '/work-items';
  try {
    if (decodeURIComponent(value).includes('\\')) return '/work-items';
    const url = new URL(value, internalOrigin);
    const knownPath = /^\/(?:work-items(?:\/[A-Za-z0-9-]+)?|settings|dashboard)?$/;
    if (url.origin !== internalOrigin || !knownPath.test(url.pathname))
      return '/work-items';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/work-items';
  }
}

export function returnPathFromState(state: unknown): string {
  return safeReturnPath(
    state && typeof state === 'object' && 'from' in state ? state.from : undefined
  );
}
