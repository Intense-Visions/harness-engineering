import { describe, it, expect } from 'vitest';
import { V1_BRIDGE_ROUTES, isV1Bridge, requiredBridgeScope } from './v1-bridge-routes';

describe('V1_BRIDGE_ROUTES registry', () => {
  it('has Phase 2 bridge primitives registered with correct scopes', () => {
    const triplets = V1_BRIDGE_ROUTES.map((r) => ({
      method: r.method,
      pattern: r.pattern.source,
      scope: r.scope,
    }));
    expect(triplets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', scope: 'trigger-job' }),
        expect.objectContaining({ method: 'POST', scope: 'resolve-interaction' }),
        expect.objectContaining({ method: 'GET', scope: 'read-telemetry' }),
      ])
    );
  });
  it('isV1Bridge matches Phase 2 bridge paths', () => {
    expect(isV1Bridge('POST', '/api/v1/jobs/maintenance')).toBe(true);
    expect(isV1Bridge('POST', '/api/v1/interactions/int_abc/resolve')).toBe(true);
    expect(isV1Bridge('GET', '/api/v1/events')).toBe(true);
    expect(isV1Bridge('POST', '/api/v1/interactions/int_abc/resolve?x=1')).toBe(true);
    expect(isV1Bridge('GET', '/api/v1/state')).toBe(false);
    expect(isV1Bridge('POST', '/api/v1/state')).toBe(false);
  });
  it('requiredBridgeScope returns the registry scope for matching routes', () => {
    expect(requiredBridgeScope('POST', '/api/v1/jobs/maintenance')).toBe('trigger-job');
    expect(requiredBridgeScope('GET', '/api/v1/events')).toBe('read-telemetry');
    expect(requiredBridgeScope('GET', '/api/v1/jobs/maintenance')).toBeNull();
  });

  // ── LMLM Phase 7 read surface ──
  const LMLM_GETS = [
    '/api/v1/local-models/hardware',
    '/api/v1/local-models/pool',
    '/api/v1/local-models/recommendations',
    '/api/v1/local-models/proposals',
  ];

  it('registers all four LMLM Phase 7 GET routes as read-status bridge primitives', () => {
    for (const url of LMLM_GETS) {
      // Bridge match short-circuits the /api/v1 → /api/local-models rewrite that
      // would otherwise misroute these to the legacy status handler.
      expect(isV1Bridge('GET', url)).toBe(true);
      expect(isV1Bridge('GET', `${url}?top=3`)).toBe(true);
      expect(requiredBridgeScope('GET', url)).toBe('read-status');
    }
  });

  it('does not bridge non-GET methods on the LMLM read routes', () => {
    // POST /refresh has its own bridge entry; the read routes are GET-only.
    expect(isV1Bridge('POST', '/api/v1/local-models/pool')).toBe(false);
    expect(isV1Bridge('DELETE', '/api/v1/local-models/hardware')).toBe(false);
  });

  // ── AMR Phase 5 routing control plane (D4) ──
  it('gates PUT /routing/policy behind `admin` and GET /routing/telemetry behind `read-telemetry`', () => {
    // PUT policy is a control-plane WRITE → admin (a superset scope); the GET is
    // read-only observability → read-telemetry (matches config/decisions/trace).
    expect(requiredBridgeScope('PUT', '/api/v1/routing/policy')).toBe('admin');
    expect(requiredBridgeScope('GET', '/api/v1/routing/telemetry')).toBe('read-telemetry');
    expect(isV1Bridge('PUT', '/api/v1/routing/policy')).toBe(true);
    expect(isV1Bridge('GET', '/api/v1/routing/telemetry?since=0')).toBe(true);
    // A GET on the policy write-path is NOT registered (no accidental read alias).
    expect(requiredBridgeScope('GET', '/api/v1/routing/policy')).toBeNull();
  });
});
