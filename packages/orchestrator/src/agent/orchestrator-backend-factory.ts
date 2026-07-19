import type {
  AgentBackend,
  BackendDef,
  RoutingConfig,
  RoutingUseCase,
  ContainerConfig,
  SecretConfig,
} from '@harness-engineering/types';
import type { CacheMetricsRecorder } from '@harness-engineering/core';
import { BackendRouter } from './backend-router.js';
import type { RoutingDecisionBus } from '../routing/decision-bus.js';
import { createBackend, isLocalEndpointBackend } from './backend-factory.js';
import { ContainerBackend } from './backends/container.js';
import { DockerRuntime } from './runtime/docker.js';
import { createSecretBackend } from './secrets/index.js';
import { LocalBackend } from './backends/local.js';
import { PiBackend } from './backends/pi.js';
import { OllamaBackend } from './backends/ollama.js';

/**
 * Options for `OrchestratorBackendFactory`.
 *
 * `sandboxPolicy` and `container`/`secrets` mirror the orchestrator's own
 * agent-config fields. `getResolverModelFor` is a registration hook the
 * orchestrator calls to bind each `local`/`pi` backend to its
 * `LocalModelResolver` (so multi-resolver array-fallback works without
 * leaking resolver lifetimes into the factory).
 */
/**
 * Runtime-feedback callbacks a `local`/`pi` backend fires as turns complete.
 * See {@link OrchestratorBackendFactoryOptions.getModelUsageHooksFor}.
 */
export interface LocalModelUsageHooks {
  /** Fired with the resolved model after a successful turn (LRU + breaker clear). */
  onModelUsed?: (model: string) => void;
  /** Fired with the resolved model after a failed turn (breaker increment). */
  onModelFailed?: (model: string) => void;
}

export interface OrchestratorBackendFactoryOptions {
  backends: Record<string, BackendDef>;
  routing: RoutingConfig;
  sandboxPolicy: 'none' | 'docker';
  container?: ContainerConfig;
  secrets?: SecretConfig;
  /**
   * Hook for resolver injection. Invoked per `local`/`pi` backend at
   * `forUseCase()` time with the backend's name. When the hook returns a
   * function, the factory rebuilds the local/pi instance using that
   * function as `getModel` (overriding the head-of-array placeholder
   * baked into `createBackend`). Returning `undefined` means "no
   * resolver registered for this name" — the placeholder stays in place.
   *
   * This indirection keeps the factory ignorant of `LocalModelResolver`'s
   * existence and lifecycle while still letting it produce backends that
   * route through the resolver Map.
   */
  getResolverModelFor?: (
    backendName: string,
    useCase: RoutingUseCase
  ) => (() => string | null) | undefined;
  /**
   * Consumption Phase 3 (T11): per-`local`/`pi` backend hook returning the
   * runtime-feedback callbacks bound to that backend's resolver + pool. The
   * factory forwards them to the constructed `LocalBackend` so a completed turn
   * stamps `lastUsedAt` (LRU) + clears the circuit breaker, and a failed turn
   * feeds the breaker. Returning `undefined` means "no feedback wiring" (the
   * backend runs exactly as before). Kept parallel to `getResolverModelFor` so
   * the factory stays ignorant of resolver/pool lifecycles.
   */
  getModelUsageHooksFor?: (backendName: string) => LocalModelUsageHooks | undefined;
  /**
   * Phase 5: prompt-cache recorder forwarded to Anthropic-capable backends.
   * Other backends accept-but-ignore. Shared across dispatches so the
   * `/api/v1/telemetry/cache/stats` endpoint sees the full rolling window.
   */
  cacheMetrics?: CacheMetricsRecorder;
  /**
   * Spec B Phase 4 (D8): forwarded to the underlying BackendRouter so
   * every resolve() during forUseCase / resolveName emits.
   */
  decisionBus?: RoutingDecisionBus;
}

/**
 * High-level factory wrapping `BackendRouter` + `createBackend` plus
 * orchestrator-side concerns (sandbox wrapping, resolver binding).
 *
 * Spec 2 SC22-SC25: every `forUseCase(useCase)` call returns a fresh
 * `AgentBackend` whose class matches the routed `BackendDef.type`.
 * `local`/`pi` defs are bound to their per-name resolver before being
 * returned, and the result is wrapped in `ContainerBackend` when
 * sandboxPolicy is 'docker'.
 */
export class OrchestratorBackendFactory {
  private readonly router: BackendRouter;
  private readonly opts: OrchestratorBackendFactoryOptions;

  constructor(opts: OrchestratorBackendFactoryOptions) {
    this.opts = opts;
    this.router = new BackendRouter({
      backends: opts.backends,
      routing: opts.routing,
      ...(opts.decisionBus !== undefined ? { decisionBus: opts.decisionBus } : {}),
    });
  }

  /**
   * Resolve `useCase` to a backend name, materialize a fresh
   * `AgentBackend`, optionally rebind its model resolver, and apply
   * sandbox wrapping. Idempotent across calls (no caching) — the AgentRunner
   * holds the per-dispatch reference and discards it when the run ends.
   */
  /**
   * Resolve `useCase` to its routed backend name, exposing the
   * router lookup without materializing a backend. Used by callers
   * (e.g., the orchestrator's dispatch site) that need to label
   * telemetry with the routed name BEFORE constructing the backend.
   *
   * Spec 2 P2-I2: previously the orchestrator labelled `LiveSession`
   * + `StreamRecorder` with the legacy `agent.backend` field, which
   * is `undefined` for pure-modern configs. Threading the routed name
   * through dispatch eliminates that gap.
   */
  resolveName(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): string {
    return this.router.resolve(useCase, opts).backendName;
  }

  /**
   * Spec B Phase 1: expose the underlying router for callers that need
   * it directly (e.g., {@link buildIntelligencePipeline} for the
   * I1 SEL/PESL comparison fix). Read-only access; consumers must not
   * mutate router state.
   */
  getRouter(): BackendRouter {
    return this.router;
  }

  forUseCase(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): AgentBackend {
    // Spec B Phase 4 (closes P1-IMP-2): single resolve() per dispatch.
    // Pre-Phase-4 this method called resolveDefinition() and resolve()
    // separately, producing two RoutingDecisions. With Phase 4's
    // decision-bus emission that doubled the routing-decision log
    // volume per dispatch. resolveDecisionAndDef() collapses both.
    const { def, decision } = this.router.resolveDecisionAndDef(useCase, opts);
    const name = decision.backendName;
    let backend: AgentBackend;
    const createOpts = this.opts.cacheMetrics ? { cacheMetrics: this.opts.cacheMetrics } : {};

    if (isLocalEndpointBackend(def) && this.opts.getResolverModelFor) {
      // T17: thread the routed use-case so the resolver can order pooled
      // candidates by the use-case's task profile (coding/reasoning/general).
      const getModel = this.opts.getResolverModelFor(name, useCase);
      const usageHooks = this.opts.getModelUsageHooksFor?.(name);
      backend = getModel
        ? this.buildLocalLikeWithResolver(def, getModel, usageHooks)
        : createBackend(def, createOpts);
    } else {
      backend = createBackend(def, createOpts);
    }

    if (this.opts.sandboxPolicy === 'docker' && this.opts.container) {
      backend = this.wrapInContainer(backend);
    }

    return backend;
  }

  /**
   * Rebuild a `local`/`pi` backend with a resolver-bound `getModel`,
   * mirroring `createBackend`'s local/pi branches but substituting the
   * head-of-array placeholder with the orchestrator-owned resolver.
   */
  private buildLocalLikeWithResolver(
    def: BackendDef,
    getModel: () => string | null,
    usageHooks?: LocalModelUsageHooks
  ): AgentBackend {
    if (def.type === 'local') {
      return new LocalBackend({
        endpoint: def.endpoint,
        getModel,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
        ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
        ...(usageHooks?.onModelUsed !== undefined ? { onModelUsed: usageHooks.onModelUsed } : {}),
        ...(usageHooks?.onModelFailed !== undefined
          ? { onModelFailed: usageHooks.onModelFailed }
          : {}),
      });
    }
    if (def.type === 'pi') {
      // T11 (pi follow-up): PiBackend now surfaces the usage/failure hooks from
      // its streaming turn path, so runtime feedback (LRU + circuit breaker)
      // applies to `pi` too, matching `local`.
      return new PiBackend({
        endpoint: def.endpoint,
        getModel,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
        ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
        ...(usageHooks?.onModelUsed !== undefined ? { onModelUsed: usageHooks.onModelUsed } : {}),
        ...(usageHooks?.onModelFailed !== undefined
          ? { onModelFailed: usageHooks.onModelFailed }
          : {}),
      });
    }
    if (def.type === 'ollama') {
      // OllamaBackend owns its own tool loop and takes a concrete `model` rather
      // than a `getModel` callback (it resolves the head-of-array at
      // startSession). Resolve the resolver's current pick now and thread it as
      // the model, falling back to the def's own configured model when the
      // resolver has nothing (so an unprobed pool still dispatches). The
      // usage/failure hooks feed the same LRU + circuit-breaker feedback loop.
      const resolved = getModel();
      return new OllamaBackend({
        endpoint: def.endpoint,
        model: resolved ?? def.model,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
        ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
        ...(def.maxTurnsPerRun !== undefined ? { maxTurnsPerRun: def.maxTurnsPerRun } : {}),
        ...(def.disableReasoning !== undefined ? { disableReasoning: def.disableReasoning } : {}),
        // Mirror `createBackend`'s ollama branch — the resolver path previously
        // DROPPED these def fields, so a local ollama backend configured with a
        // prefer-and-fallback `model: [...]` array (which routes here) silently
        // lost its MCP tools + context/prediction tuning. `mcpServers` matters most:
        // without it a local model gets no docs tools (context7 etc.), its top
        // failure mode. Keep in sync with backend-factory.ts createBackend.
        ...(def.numCtx !== undefined ? { numCtx: def.numCtx } : {}),
        ...(def.maxContextTokens !== undefined ? { maxContextTokens: def.maxContextTokens } : {}),
        ...(def.numPredict !== undefined ? { numPredict: def.numPredict } : {}),
        ...(def.temperature !== undefined ? { temperature: def.temperature } : {}),
        ...(def.topP !== undefined ? { topP: def.topP } : {}),
        ...(def.topK !== undefined ? { topK: def.topK } : {}),
        ...(def.keepAlive !== undefined ? { keepAlive: def.keepAlive } : {}),
        ...(def.mcpServers !== undefined ? { mcpServers: def.mcpServers } : {}),
        ...(usageHooks?.onModelUsed !== undefined ? { onModelUsed: usageHooks.onModelUsed } : {}),
        ...(usageHooks?.onModelFailed !== undefined
          ? { onModelFailed: usageHooks.onModelFailed }
          : {}),
      });
    }
    // Should be unreachable — the caller guards on type, but throw for
    // type-safety rather than fall through to createBackend.
    throw new Error(
      `OrchestratorBackendFactory.buildLocalLikeWithResolver called with non-local def.type='${def.type}'`
    );
  }

  /**
   * Apply ContainerBackend wrapping (PFC-3). Pulls the runtime + secret
   * backend per call so each dispatch sees a fresh container handle map
   * (ContainerBackend keeps its own per-instance Map<sessionId, handle>).
   */
  private wrapInContainer(inner: AgentBackend): AgentBackend {
    const runtime = new DockerRuntime();
    const secretBackend = this.opts.secrets ? createSecretBackend(this.opts.secrets) : null;
    const secretKeys = this.opts.secrets?.keys ?? [];
    return new ContainerBackend(
      inner,
      runtime,
      secretBackend,
      this.opts.container as ContainerConfig,
      secretKeys
    );
  }
}
