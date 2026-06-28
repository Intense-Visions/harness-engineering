import { describe, it, expect } from 'vitest';
import type { BackendDef } from '@harness-engineering/types';
import { makeBackendResolver } from './backend-resolver.js';
import { MockBackend } from './backends/mock.js';

describe('makeBackendResolver', () => {
  const backends: Record<string, BackendDef> = {
    primary: { type: 'mock' },
  };

  it('resolves a known backend name to a live AgentBackend via createBackend', () => {
    const resolve = makeBackendResolver(backends);
    const backend = resolve('primary');
    expect(backend).toBeInstanceOf(MockBackend);
  });

  it('returns null for an unknown backend name', () => {
    const resolve = makeBackendResolver(backends);
    expect(resolve('missing')).toBeNull();
  });

  it('returns an always-null resolver when the backends map is null', () => {
    const resolve = makeBackendResolver(null);
    expect(resolve('primary')).toBeNull();
  });

  it('returns an always-null resolver when the backends map is undefined', () => {
    const resolve = makeBackendResolver(undefined);
    expect(resolve('primary')).toBeNull();
  });

  it('returns null for any name when the backends map is empty', () => {
    const resolve = makeBackendResolver({});
    expect(resolve('primary')).toBeNull();
  });
});
