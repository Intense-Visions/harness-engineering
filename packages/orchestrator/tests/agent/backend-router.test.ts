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
});
