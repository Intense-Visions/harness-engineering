import { describe, it, expect } from 'vitest';
import { SCOPE_VOCABULARY, requiredScopeForRoute, hasScope } from './scopes';

describe('SCOPE_VOCABULARY', () => {
  it('contains exactly the eight scopes pinned in the spec (post-Phase-4)', () => {
    expect([...SCOPE_VOCABULARY].sort()).toEqual([
      'admin',
      'manage-proposals',
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
  it('maps POST /api/v1/jobs/maintenance to trigger-job', () => {
    expect(requiredScopeForRoute('POST', '/api/v1/jobs/maintenance')).toBe('trigger-job');
  });
  it('maps POST /api/v1/interactions/<id>/resolve to resolve-interaction', () => {
    expect(requiredScopeForRoute('POST', '/api/v1/interactions/abc/resolve')).toBe(
      'resolve-interaction'
    );
  });
  it('maps GET /api/v1/events to read-telemetry', () => {
    expect(requiredScopeForRoute('GET', '/api/v1/events')).toBe('read-telemetry');
  });
  it('returns null (default-deny) for unmapped POST /api/v1/events', () => {
    expect(requiredScopeForRoute('POST', '/api/v1/events')).toBeNull();
  });

  // Hermes Phase 4 — proposal routes.
  it('maps GET /api/v1/proposals to read-status', () => {
    expect(requiredScopeForRoute('GET', '/api/v1/proposals')).toBe('read-status');
  });
  it('maps GET /api/v1/proposals/<id> to read-status', () => {
    expect(requiredScopeForRoute('GET', '/api/v1/proposals/proposal_abc')).toBe('read-status');
  });
  it('maps POST /api/v1/proposals/<id>/run-gate to manage-proposals', () => {
    expect(requiredScopeForRoute('POST', '/api/v1/proposals/proposal_abc/run-gate')).toBe(
      'manage-proposals'
    );
  });
  it('maps POST /api/v1/proposals/<id>/approve to manage-proposals', () => {
    expect(requiredScopeForRoute('POST', '/api/v1/proposals/proposal_abc/approve')).toBe(
      'manage-proposals'
    );
  });
  it('maps POST /api/v1/proposals/<id>/reject to manage-proposals', () => {
    expect(requiredScopeForRoute('POST', '/api/v1/proposals/proposal_abc/reject')).toBe(
      'manage-proposals'
    );
  });
  it('maps PATCH /api/v1/proposals/<id> to manage-proposals', () => {
    expect(requiredScopeForRoute('PATCH', '/api/v1/proposals/proposal_abc')).toBe(
      'manage-proposals'
    );
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
