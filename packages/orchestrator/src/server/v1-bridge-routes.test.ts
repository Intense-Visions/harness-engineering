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
});
