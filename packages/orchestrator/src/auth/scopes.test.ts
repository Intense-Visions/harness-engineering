import { describe, it, expect } from 'vitest';
import { SCOPE_VOCABULARY, requiredScopeForRoute, hasScope } from './scopes';

describe('SCOPE_VOCABULARY', () => {
  it('contains exactly the seven scopes pinned in the spec', () => {
    expect([...SCOPE_VOCABULARY].sort()).toEqual([
      'admin',
      'modify-roadmap',
      'read-status',
      'read-telemetry',
      'resolve-interaction',
      'subscribe-webhook',
      'trigger-job',
    ]);
  });
});

describe('requiredScopeForRoute', () => {
  it('maps auth-admin routes', () => {
    expect(requiredScopeForRoute('POST', '/api/v1/auth/token')).toBe('admin');
    expect(requiredScopeForRoute('GET', '/api/v1/auth/tokens')).toBe('admin');
    expect(requiredScopeForRoute('DELETE', '/api/v1/auth/tokens/tok_abc')).toBe('admin');
  });
  it('maps read-status to /api/state and /api/v1/state', () => {
    expect(requiredScopeForRoute('GET', '/api/state')).toBe('read-status');
    expect(requiredScopeForRoute('GET', '/api/v1/state')).toBe('read-status');
  });
  it('returns null for unknown routes (default-deny upstream)', () => {
    expect(requiredScopeForRoute('GET', '/api/unknown')).toBeNull();
  });
});

describe('hasScope', () => {
  it('admin satisfies any scope', () => {
    expect(hasScope(['admin'], 'trigger-job')).toBe(true);
  });
  it('non-admin must hold the exact scope', () => {
    expect(hasScope(['read-status'], 'trigger-job')).toBe(false);
    expect(hasScope(['trigger-job'], 'trigger-job')).toBe(true);
  });
});
