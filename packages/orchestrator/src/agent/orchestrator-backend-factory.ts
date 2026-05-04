import type {
  AgentBackend,
  BackendDef,
  RoutingConfig,
  RoutingUseCase,
  ContainerConfig,
  SecretConfig,
} from '@harness-engineering/types';
import { BackendRouter } from './backend-router.js';
import { createBackend } from './backend-factory.js';
import { ContainerBackend } from './backends/container.js';
import { DockerRuntime } from './runtime/docker.js';
import { createSecretBackend } from './secrets/index.js';
import { LocalBackend } from './backends/local.js';
import { PiBackend } from './backends/pi.js';

/**
 * Options for `OrchestratorBackendFactory`.
 *
 * `sandboxPolicy` and `container`/`secrets` mirror the orchestrator's own
 * agent-config fields. `getResolverModelFor` is a registration hook the
 * orchestrator calls to bind each `local`/`pi` backend to its
 * `LocalModelResolver` (so multi-resolver array-fallback works without
 * leaking resolver lifetimes into the factory).
 */
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
  getResolverModelFor?: (backendName: string) => (() => string | null) | undefined;
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
    this.router = new BackendRouter({ backends: opts.backends, routing: opts.routing });
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
  resolveName(useCase: RoutingUseCase): string {
    return this.router.resolve(useCase);
  }

  forUseCase(useCase: RoutingUseCase): AgentBackend {
    const def = this.router.resolveDefinition(useCase);
    const name = this.router.resolve(useCase);
    let backend: AgentBackend;

    if ((def.type === 'local' || def.type === 'pi') && this.opts.getResolverModelFor) {
      const getModel = this.opts.getResolverModelFor(name);
      backend = getModel ? this.buildLocalLikeWithResolver(def, getModel) : createBackend(def);
    } else {
      backend = createBackend(def);
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
  private buildLocalLikeWithResolver(def: BackendDef, getModel: () => string | null): AgentBackend {
    if (def.type === 'local') {
      return new LocalBackend({
        endpoint: def.endpoint,
        getModel,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
        ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
      });
    }
    if (def.type === 'pi') {
      return new PiBackend({
        endpoint: def.endpoint,
        getModel,
        ...(def.apiKey !== undefined ? { apiKey: def.apiKey } : {}),
        ...(def.timeoutMs !== undefined ? { timeoutMs: def.timeoutMs } : {}),
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
