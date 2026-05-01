import { describe, it, expect } from 'vitest';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';
import { BackendRouter } from '../../src/agent/backend-router.js';

const cloud: BackendDef = { type: 'claude', command: 'claude' };
const local: BackendDef = {
  type: 'pi',
  endpoint: 'http://pi.local:1234/v1',
  model: ['gemma-4-e4b'],
};

describe('BackendRouter — resolution', () => {
  it('returns the named backend for a tier scope', () => {
    const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    expect(router.getBackendName('quick-fix')).toBe('local');
  });

  it('falls back to default when a tier scope is not in routing', () => {
    const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    expect(router.getBackendName('guided-change')).toBe('cloud');
  });

  it('falls back to default for an unknown scope string (no throw)', () => {
    const routing: RoutingConfig = { default: 'cloud' };
    const router = new BackendRouter({ backends: { cloud }, routing });
    expect(router.getBackendName('totally-made-up')).toBe('cloud');
  });

  it('returns the BackendDef reference (identity, not a copy) from getBackend', () => {
    const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
    const backends = { cloud, local };
    const router = new BackendRouter({ backends, routing });
    expect(router.getBackend('quick-fix')).toBe(backends.local);
    expect(router.getBackend('guided-change')).toBe(backends.cloud);
  });

  it('resolves intelligence-layer routes when set', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      intelligence: { sel: 'local' },
    };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    expect(router.getBackendName('default', 'sel')).toBe('local');
  });

  it('falls back to default when intelligence layer is unmapped', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      intelligence: { sel: 'local' },
    };
    const router = new BackendRouter({ backends: { cloud, local }, routing });
    expect(router.getBackendName('default', 'pesl')).toBe('cloud');
  });

  it('falls back to default when intelligence map is absent', () => {
    const routing: RoutingConfig = { default: 'cloud' };
    const router = new BackendRouter({ backends: { cloud }, routing });
    expect(router.getBackendName('default', 'sel')).toBe('cloud');
  });
});

describe('BackendRouter — construction-time validation', () => {
  it('throws when routing.default names a missing backend', () => {
    const routing: RoutingConfig = { default: 'nope' };
    expect(() => new BackendRouter({ backends: { cloud }, routing })).toThrowError(
      /unknown backend.*nope/
    );
  });

  it('throws when a tier scope names a missing backend', () => {
    const routing: RoutingConfig = { default: 'cloud', diagnostic: 'ghost' };
    expect(() => new BackendRouter({ backends: { cloud }, routing })).toThrowError(
      /diagnostic.*ghost/
    );
  });

  it('throws when an intelligence layer names a missing backend', () => {
    const routing: RoutingConfig = {
      default: 'cloud',
      intelligence: { sel: 'phantom' },
    };
    expect(() => new BackendRouter({ backends: { cloud }, routing })).toThrowError(
      /intelligence\.sel.*phantom/
    );
  });

  it('lists known backends in the error for diagnostics', () => {
    const routing: RoutingConfig = { default: 'nope' };
    expect(() => new BackendRouter({ backends: { cloud, local }, routing })).toThrowError(
      /Defined backends.*cloud.*local|Defined backends.*local.*cloud/
    );
  });
});

describe('BackendRouter + createBackend integration', () => {
  it('round-trips: router resolves def, factory builds matching backend class', async () => {
    const { createBackend } = await import('../../src/agent/backend-factory.js');
    const { ClaudeBackend } = await import('../../src/agent/backends/claude.js');
    const { PiBackend } = await import('../../src/agent/backends/pi.js');

    const routing: RoutingConfig = {
      default: 'cloud',
      'quick-fix': 'local',
      intelligence: { sel: 'local' },
    };
    const router = new BackendRouter({ backends: { cloud, local }, routing });

    const cloudDef = router.getBackend('guided-change');
    const localDef = router.getBackend('quick-fix');
    const intelDef = router.getBackend('default', 'sel');

    expect(createBackend(cloudDef)).toBeInstanceOf(ClaudeBackend);
    expect(createBackend(localDef)).toBeInstanceOf(PiBackend);
    expect(createBackend(intelDef)).toBeInstanceOf(PiBackend);
  });
});
