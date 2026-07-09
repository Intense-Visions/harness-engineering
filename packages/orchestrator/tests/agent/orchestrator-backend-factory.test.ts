import { describe, it, expect, vi } from 'vitest';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory.js';
import { ClaudeBackend } from '../../src/agent/backends/claude.js';
import { PiBackend } from '../../src/agent/backends/pi.js';
import { RoutingDecisionBus } from '../../src/routing/decision-bus.js';

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

  it('T17: passes the routed use-case to getResolverModelFor', () => {
    let receivedUseCase: unknown = null;
    const factory = new OrchestratorBackendFactory({
      backends,
      routing,
      sandboxPolicy: 'none',
      getResolverModelFor: (_name: string, useCase: unknown) => {
        receivedUseCase = useCase;
        return () => 'resolved-model';
      },
    });
    // 'quick-fix' routes to the local backend in this fixture, so the resolver
    // hook fires and receives the full use-case.
    factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
    expect(receivedUseCase).toEqual({ kind: 'tier', tier: 'quick-fix' });
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

  it('T11: forwards getModelUsageHooksFor to a local backend (onModelUsed/onModelFailed)', async () => {
    const { LocalBackend } = await import('../../src/agent/backends/local.js');
    const localDef: BackendDef = { type: 'local', endpoint: 'http://x:11434/v1', model: 'm' };
    const onModelUsed = vi.fn();
    const onModelFailed = vi.fn();
    let hooksQueriedFor: string | null = null;
    const factory = new OrchestratorBackendFactory({
      backends: { cloud, localx: localDef },
      routing: { default: 'cloud', 'quick-fix': 'localx' } as RoutingConfig,
      sandboxPolicy: 'none',
      getResolverModelFor: () => () => 'resolved-model',
      getModelUsageHooksFor: (name: string) => {
        hooksQueriedFor = name;
        return { onModelUsed, onModelFailed };
      },
    });
    const backend = factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
    expect(backend).toBeInstanceOf(LocalBackend);
    expect(hooksQueriedFor).toBe('localx');
    // The hooks reached the constructed backend (private fields, runtime-visible).
    const priv = backend as unknown as {
      onModelUsed?: (m: string) => void;
      onModelFailed?: (m: string) => void;
    };
    expect(priv.onModelUsed).toBe(onModelUsed);
    expect(priv.onModelFailed).toBe(onModelFailed);
  });

  it('T11: a local backend builds fine when no usage hooks are registered', async () => {
    const { LocalBackend } = await import('../../src/agent/backends/local.js');
    const localDef: BackendDef = { type: 'local', endpoint: 'http://x:11434/v1', model: 'm' };
    const factory = new OrchestratorBackendFactory({
      backends: { cloud, localx: localDef },
      routing: { default: 'cloud', 'quick-fix': 'localx' } as RoutingConfig,
      sandboxPolicy: 'none',
      getResolverModelFor: () => () => 'resolved-model',
      // no getModelUsageHooksFor
    });
    const backend = factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
    expect(backend).toBeInstanceOf(LocalBackend);
    const priv = backend as unknown as { onModelUsed?: unknown; onModelFailed?: unknown };
    expect(priv.onModelUsed).toBeUndefined();
    expect(priv.onModelFailed).toBeUndefined();
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

  describe('invocationOverride (Spec B Phase 3)', () => {
    // Two-backend fixture: routing.default → cloud; quick-fix → local.
    // With invocationOverride='local', resolveName/forUseCase should
    // return the local backend regardless of the routed default.
    const phase3Backends: Record<string, BackendDef> = {
      cloud: { type: 'claude', command: 'claude' },
      local: { type: 'pi', endpoint: 'http://x:1234/v1', model: 'm' },
    };
    const phase3Routing: RoutingConfig = { default: 'cloud' };

    it('resolveName forwards invocationOverride to the router and returns the override', () => {
      const factory = new OrchestratorBackendFactory({
        backends: phase3Backends,
        routing: phase3Routing,
        sandboxPolicy: 'none',
      });
      // Without override → default 'cloud'.
      expect(factory.resolveName({ kind: 'tier', tier: 'quick-fix' })).toBe('cloud');
      // With override → 'local' wins.
      expect(
        factory.resolveName({ kind: 'tier', tier: 'quick-fix' }, { invocationOverride: 'local' })
      ).toBe('local');
    });

    it('forUseCase forwards invocationOverride to the router and materializes the named backend', () => {
      const factory = new OrchestratorBackendFactory({
        backends: phase3Backends,
        routing: phase3Routing,
        sandboxPolicy: 'none',
      });
      // Without override → ClaudeBackend (cloud).
      expect(factory.forUseCase({ kind: 'tier', tier: 'quick-fix' })).toBeInstanceOf(ClaudeBackend);
      // With override → PiBackend (local).
      expect(
        factory.forUseCase({ kind: 'tier', tier: 'quick-fix' }, { invocationOverride: 'local' })
      ).toBeInstanceOf(PiBackend);
    });
  });

  describe('single-resolve invariant (Spec B Phase 4)', () => {
    it('forUseCase calls router.resolve exactly once', () => {
      const bus = new RoutingDecisionBus({ capacity: 5 });
      const factory = new OrchestratorBackendFactory({
        backends: { cloud: { type: 'claude', command: 'claude' } },
        routing: { default: 'cloud' },
        sandboxPolicy: 'none',
        decisionBus: bus,
      });
      const router = factory.getRouter();
      const resolveSpy = vi.spyOn(router, 'resolve');
      factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(bus.recent()).toHaveLength(1);
    });
  });
});
