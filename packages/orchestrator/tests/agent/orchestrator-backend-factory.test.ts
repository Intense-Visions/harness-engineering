import { describe, it, expect, vi } from 'vitest';
import type { BackendDef, RoutingConfig } from '@harness-engineering/types';
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory.js';
import { ClaudeBackend } from '../../src/agent/backends/claude.js';
import { PiBackend } from '../../src/agent/backends/pi.js';
import { OllamaBackend } from '../../src/agent/backends/ollama.js';
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

  it('T11 (pi): forwards getModelUsageHooksFor to a pi backend', () => {
    const onModelUsed = vi.fn();
    const onModelFailed = vi.fn();
    const factory = new OrchestratorBackendFactory({
      backends, // `local` in this fixture is a pi-typed def
      routing,
      sandboxPolicy: 'none',
      getResolverModelFor: () => () => 'resolved-model',
      getModelUsageHooksFor: () => ({ onModelUsed, onModelFailed }),
    });
    const backend = factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
    expect(backend).toBeInstanceOf(PiBackend);
    // PiBackend stores hooks on its private `config`.
    const cfg = (
      backend as unknown as {
        config: { onModelUsed?: unknown; onModelFailed?: unknown };
      }
    ).config;
    expect(cfg.onModelUsed).toBe(onModelUsed);
    expect(cfg.onModelFailed).toBe(onModelFailed);
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

  // Regression: buildLocalLikeWithResolver's ollama branch previously DROPPED
  // def.mcpServers (+ numCtx/maxContextTokens/numPredict/keepAlive). A local
  // ollama backend with a prefer-and-fallback `model: [...]` ARRAY routes through
  // the resolver path (getResolverModelFor ⇒ buildLocalLikeWithResolver), NOT
  // createBackend — so the dropped mcpServers meant the local model reached its
  // dispatch with NO MCP docs tools (context7 etc.), its top failure mode. These
  // assertions FAIL against the pre-fix branch and pass now (the branch mirrors
  // createBackend's ollama branch).
  describe('ollama resolver path threads MCP + tuning def fields', () => {
    // An ollama def with a `model` ARRAY forces the resolver/array path. The MCP +
    // tuning fields must survive the rebuild in buildLocalLikeWithResolver.
    const ollamaMcp: BackendDef = {
      type: 'ollama',
      endpoint: 'http://x:11434/v1',
      model: ['primary:32b', 'fallback:8b'],
      mcpServers: [{ name: 'context7', command: 'npx', args: ['-y', '@upstash/context7-mcp'] }],
      numCtx: 16384,
      maxContextTokens: 32768,
      numPredict: 4096,
      keepAlive: '15m',
    };
    const ollamaBackends: Record<string, BackendDef> = { cloud, ollamaLocal: ollamaMcp };
    const ollamaRouting: RoutingConfig = { default: 'cloud', 'quick-fix': 'ollamaLocal' };

    it('threads def.mcpServers into the constructed OllamaBackend (resolver/array path)', () => {
      const factory = new OrchestratorBackendFactory({
        backends: ollamaBackends,
        routing: ollamaRouting,
        sandboxPolicy: 'none',
        // Returning a getModel routes this local def through
        // buildLocalLikeWithResolver rather than createBackend.
        getResolverModelFor: () => () => 'primary:32b',
      });
      const backend = factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
      expect(backend).toBeInstanceOf(OllamaBackend);
      // OllamaBackend stores its constructor config on the private `config` field
      // (same private-config inspection the T11 pi test above uses).
      const cfg = (backend as unknown as { config: { mcpServers?: unknown } }).config;
      expect(cfg.mcpServers).toEqual(ollamaMcp.mcpServers);
    });

    it('threads numCtx/maxContextTokens/numPredict/keepAlive into the OllamaBackend', () => {
      const factory = new OrchestratorBackendFactory({
        backends: ollamaBackends,
        routing: ollamaRouting,
        sandboxPolicy: 'none',
        getResolverModelFor: () => () => 'primary:32b',
      });
      const backend = factory.forUseCase({ kind: 'tier', tier: 'quick-fix' });
      expect(backend).toBeInstanceOf(OllamaBackend);
      const cfg = (
        backend as unknown as {
          config: {
            numCtx?: number;
            maxContextTokens?: number;
            numPredict?: number;
            keepAlive?: string;
          };
        }
      ).config;
      expect(cfg.numCtx).toBe(16384);
      expect(cfg.maxContextTokens).toBe(32768);
      expect(cfg.numPredict).toBe(4096);
      expect(cfg.keepAlive).toBe('15m');
    });
  });
});
