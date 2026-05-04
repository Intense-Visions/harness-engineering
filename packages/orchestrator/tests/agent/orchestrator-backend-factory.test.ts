import { describe, it, expect } from 'vitest';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory.js';
import { ClaudeBackend } from '../../src/agent/backends/claude.js';
import { PiBackend } from '../../src/agent/backends/pi.js';

const cloud: BackendDef = { type: 'claude', command: 'claude' };
const local: BackendDef = {
  type: 'pi',
  endpoint: 'http://x:1234/v1',
  model: 'm',
};

describe('OrchestratorBackendFactory', () => {
  const backends: Record<string, BackendDef> = { cloud, local };
  const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };

  it('produces a backend matching the routed BackendDef.type', () => {
    const factory = new OrchestratorBackendFactory({ backends, routing, sandboxPolicy: 'none' });
    expect(factory.forUseCase({ kind: 'tier', tier: 'quick-fix' })).toBeInstanceOf(PiBackend);
    expect(factory.forUseCase({ kind: 'tier', tier: 'guided-change' })).toBeInstanceOf(
      ClaudeBackend
    );
  });

  it('returns a fresh backend instance per call', () => {
    const factory = new OrchestratorBackendFactory({ backends, routing, sandboxPolicy: 'none' });
    const a = factory.forUseCase({ kind: 'tier', tier: 'guided-change' });
    const b = factory.forUseCase({ kind: 'tier', tier: 'guided-change' });
    expect(a).not.toBe(b);
  });

  it('falls through to default for maintenance and chat use cases', () => {
    const factory = new OrchestratorBackendFactory({ backends, routing, sandboxPolicy: 'none' });
    expect(factory.forUseCase({ kind: 'maintenance' })).toBeInstanceOf(ClaudeBackend);
    expect(factory.forUseCase({ kind: 'chat' })).toBeInstanceOf(ClaudeBackend);
  });

  it('wires getResolverModelFor to local/pi defs (PFC-1)', () => {
    let invokedFor: string | null = null;
    const factory = new OrchestratorBackendFactory({
      backends,
      routing,
      sandboxPolicy: 'none',
      getResolverModelFor: (name: string) => {
        invokedFor = name;
        return () => 'resolved-model';
      },
    });
    const backend = factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
    expect(backend).toBeInstanceOf(PiBackend);
    // The hook should have been queried for the routed backend name.
    expect(invokedFor).toBe('local');
  });

  it('does not call getResolverModelFor for non-local backends', () => {
    let invokedFor: string | null = null;
    const factory = new OrchestratorBackendFactory({
      backends,
      routing,
      sandboxPolicy: 'none',
      getResolverModelFor: (name: string) => {
        invokedFor = name;
        return () => 'resolved-model';
      },
    });
    factory.forUseCase({ kind: 'tier', tier: 'guided-change' });
    expect(invokedFor).toBe(null);
  });

  it('wraps with ContainerBackend when sandboxPolicy=docker AND container set (PFC-3)', async () => {
    const { ContainerBackend } = await import('../../src/agent/backends/container.js');
    const factory = new OrchestratorBackendFactory({
      backends,
      routing,
      sandboxPolicy: 'docker',
      container: {
        image: 'fake:latest',
        mounts: [],
      } as unknown as never,
    });
    expect(factory.forUseCase({ kind: 'tier', tier: 'guided-change' })).toBeInstanceOf(
      ContainerBackend
    );
  });

  it('does not wrap with ContainerBackend when sandboxPolicy=none', async () => {
    const { ContainerBackend } = await import('../../src/agent/backends/container.js');
    const factory = new OrchestratorBackendFactory({ backends, routing, sandboxPolicy: 'none' });
    expect(factory.forUseCase({ kind: 'tier', tier: 'guided-change' })).not.toBeInstanceOf(
      ContainerBackend
    );
  });
});
