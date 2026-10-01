import { describe, expect, it } from 'vitest';
import { returnPathFromState, safeReturnPath } from './returnPath';

describe('safeReturnPath', () => {
  it.each([
    '/',
    '/work-items',
    '/work-items/item-123?tab=activity#history',
    '/settings?view=account',
    '/dashboard',
  ])('preserves the known protected path %s', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    undefined,
    null,
    {},
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/work-items%5c/evil.example',
    'javascript:alert(1)',
    '/login',
    '/register',
    '/unknown',
    '/work-items/id/extra',
    '/%2f%2fevil.example',
    '/settings\n',
    '/work-items/%',
  ])('rejects an unsafe or unknown destination %s', (path) => {
    expect(safeReturnPath(path)).toBe('/work-items');
  });

  it('reads only a validated from value from navigation state', () => {
    expect(returnPathFromState({ from: '/work-items/123?q=test#comments' })).toBe(
      '/work-items/123?q=test#comments'
    );
    expect(returnPathFromState({ from: '//evil.example' })).toBe('/work-items');
    expect(returnPathFromState({ pathname: '/settings' })).toBe('/work-items');
  });
});
