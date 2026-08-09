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
  it('maps POST /api/chat to trigger-job (chat proxy, legacy path the dashboard posts to)', () => {
    expect(requiredScopeForRoute('POST', '/api/chat')).toBe('trigger-job');
  });
  it('maps POST /api/chat-proxy to trigger-job (v1 alias rewrite target)', () => {
    expect(requiredScopeForRoute('POST', '/api/chat-proxy')).toBe('trigger-job');
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

// The prefix map is the last-resort resolution layer, and it is the only one
// that ever keyed on path alone. These cases pin the method dimension so a new
// prefix entry cannot re-authorize writes under a read scope.
describe('requiredScopeForRoute — prefix fallback is method-aware', () => {
  it('separates read from write on /api/plans', () => {
    expect(requiredScopeForRoute('GET', '/api/plans')).toBe('read-status');
    expect(requiredScopeForRoute('POST', '/api/plans')).toBe('trigger-job');
  });

  it('separates read from write on /api/sessions, including per-id paths', () => {
    expect(requiredScopeForRoute('GET', '/api/sessions')).toBe('read-status');
    expect(requiredScopeForRoute('GET', '/api/sessions/abc')).toBe('read-status');
    expect(requiredScopeForRoute('POST', '/api/sessions')).toBe('trigger-job');
    expect(requiredScopeForRoute('PATCH', '/api/sessions/abc')).toBe('trigger-job');
    expect(requiredScopeForRoute('DELETE', '/api/sessions/abc')).toBe('trigger-job');
  });

  it('requires a write scope for POST /api/analyze (runs the intelligence pipeline)', () => {
    expect(requiredScopeForRoute('POST', '/api/analyze')).toBe('trigger-job');
  });

  it('routes HEAD to the read scope, not the write scope', () => {
    expect(requiredScopeForRoute('HEAD', '/api/plans')).toBe('read-status');
    expect(requiredScopeForRoute('HEAD', '/api/sessions')).toBe('read-status');
  });

  it('default-denies mutating methods on GET-only prefixes', () => {
    expect(requiredScopeForRoute('POST', '/api/analyses')).toBeNull();
    expect(requiredScopeForRoute('DELETE', '/api/streams')).toBeNull();
    expect(requiredScopeForRoute('POST', '/api/local-model')).toBeNull();
    expect(requiredScopeForRoute('PATCH', '/api/local-models')).toBeNull();
    // …while their read paths are untouched.
    expect(requiredScopeForRoute('GET', '/api/analyses')).toBe('read-status');
    expect(requiredScopeForRoute('GET', '/api/streams')).toBe('read-status');
  });

  it('does not escalate prefixes that were already write-grade', () => {
    expect(requiredScopeForRoute('GET', '/api/interactions')).toBe('resolve-interaction');
    expect(requiredScopeForRoute('PATCH', '/api/interactions/abc')).toBe('resolve-interaction');
    expect(requiredScopeForRoute('GET', '/api/maintenance/status')).toBe('trigger-job');
    expect(requiredScopeForRoute('POST', '/api/maintenance/trigger')).toBe('trigger-job');
  });

  it('keeps the exact /api/chat guard ahead of the /api/chat-proxy prefix', () => {
    expect(requiredScopeForRoute('GET', '/api/chat')).toBe('trigger-job');
    expect(requiredScopeForRoute('POST', '/api/chat')).toBe('trigger-job');
    expect(requiredScopeForRoute('POST', '/api/chat-proxy')).toBe('trigger-job');
  });

  it('still returns null for a path outside every prefix', () => {
    expect(requiredScopeForRoute('POST', '/api/unknown')).toBeNull();
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
