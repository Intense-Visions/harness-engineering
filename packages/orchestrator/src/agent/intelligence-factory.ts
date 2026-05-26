import {
  IntelligencePipeline,
  AnthropicAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
  ClaudeCliAnalysisProvider,
  type AnalysisProvider,
} from '@harness-engineering/intelligence';
import { GraphStore } from '@harness-engineering/graph';
import type { WorkflowConfig, BackendDef } from '@harness-engineering/types';
import type { LocalModelResolver } from './local-model-resolver';
import { buildAnalysisProvider } from './analysis-provider-factory';
import type { BackendRouter } from './backend-router';
import type { StructuredLogger } from '../logging/logger';

/**
 * Spec B Phase 4 (closes Phase 1 deferred finding P1-IMP-1): the
 * pipeline-build path needs the router for the SC34/SC35 sel-vs-pesl
 * dedupe; the per-layer path does not (it only consults the router on
 * the routing-driven branch, which is opt-in via router presence).
 */
export interface BuildPipelineDeps {
  config: WorkflowConfig;
  localResolvers: Map<string, LocalModelResolver>;
  logger: StructuredLogger;
  router: BackendRouter;
}

export interface BuildLayerDeps {
  config: WorkflowConfig;
  localResolvers: Map<string, LocalModelResolver>;
  logger: StructuredLogger;
  /**
   * Optional: routing-driven branch consults the router when present;
   * the intelligence.provider-explicit branch ignores it (test fixtures
   * using only intel.provider may omit). When the routing-driven branch
   * is reached and `router` is undefined, `buildAnalysisProviderForLayer`
   * returns null.
   */
  router?: BackendRouter;
}

/** @deprecated kept as a compat re-export for one release; new code should use BuildPipelineDeps. */
export type IntelligenceFactoryDeps = BuildPipelineDeps;

export interface IntelligencePipelineBundle {
  pipeline: IntelligencePipeline;
  graphStore: GraphStore;
}

/**
 * Build the intelligence pipeline (sel + optional pesl provider, graph
 * store) from config. Returns null when intelligence is disabled or no
 * sel provider can be resolved.
 *
 * The caller is responsible for assigning the returned graphStore to
 * any field that needs it; this module owns no orchestrator state.
 */
export function buildIntelligencePipeline(
  deps: BuildPipelineDeps
): IntelligencePipelineBundle | null {
  const { config, router } = deps;
  const intel = config.intelligence;
  if (!intel?.enabled) return null;

  const selProvider = buildAnalysisProviderForLayer('sel', deps);
  if (!selProvider) return null;

  // Spec 2 SC34/SC35: when sel and pesl route to different backends,
  // build a distinct provider for the PESL layer. When they route to
  // the same backend (or pesl is unset), pass undefined so the
  // pipeline falls back to the sel provider (current behavior).
  //
  // Spec B Phase 1 (closes Phase 0 review finding I1 part 1): ask the
  // canonical router to resolve the actual chosen backend name for sel
  // vs pesl. This compares post-chain-walk names, so two distinct
  // chains that resolve to the same backend (via availability
  // filtering) compare equal — the original intent of the SC34/SC35
  // dedupe optimization. The Phase 0 toScalar shim and its no-router
  // fallback are gone (per operator decision U2).
  const peslName = router.resolve({ kind: 'intelligence', layer: 'pesl' }).backendName;
  const selName = router.resolve({ kind: 'intelligence', layer: 'sel' }).backendName;
  const peslProvider = peslName !== selName ? buildAnalysisProviderForLayer('pesl', deps) : null;

  const peslModel = intel.models?.pesl ?? config.agent.model;
  const graphStore = new GraphStore();
  const pipeline = new IntelligencePipeline(selProvider, graphStore, {
    ...(peslModel !== undefined && { peslModel }),
    ...(peslProvider !== null && peslProvider !== undefined && { peslProvider }),
  });
  return { pipeline, graphStore };
}

/**
 * Build the AnalysisProvider for a single intelligence layer.
 *
 * Spec 2 Phase 4 (SC31–SC36) resolution order:
 *   1. Explicit `intelligence.provider` config wins (preserves Phase 0–3
 *      behavior; SC33).
 *   2. Otherwise, consult `agent.routing.intelligence.<layer>` (or
 *      `routing.default`) to pick a `BackendDef` from `agent.backends`,
 *      then translate via `buildAnalysisProvider`.
 */
export function buildAnalysisProviderForLayer(
  layer: 'sel' | 'pesl',
  deps: BuildLayerDeps
): AnalysisProvider | null {
  const { config, localResolvers, logger } = deps;
  const intel = config.intelligence;
  if (!intel?.enabled) return null;

  // 1. Explicit intelligence.provider override (SC33).
  if (intel.provider) {
    const layerModel = layer === 'sel' ? intel.models?.sel : intel.models?.pesl;
    return buildExplicitProvider(intel.provider, layerModel ?? config.agent.model, config);
  }

  // 2. Routing-driven selection (SC31, SC32, SC36).
  const routed = resolveRoutedBackend(layer, deps);
  if (!routed) return null;

  const { name, def } = routed;
  const resolver = localResolvers.get(name);
  return buildAnalysisProvider({
    def,
    backendName: name,
    layer,
    // Spec 2 P3-IMP-1: a single snapshot read feeds the factory's
    // unavailable-warn diagnostic (Configured/Detected lists) and
    // collapses the two `getStatus()` calls flagged by P3-SUG-2.
    getResolverStatusSnapshot: () => {
      if (!resolver) return null;
      const status = resolver.getStatus();
      return {
        available: status.available,
        resolved: status.resolved,
        configured: status.configured,
        detected: status.detected,
      };
    },
    intelligence: intel,
    logger,
  });
}

/**
 * Look up the routed BackendDef for an intelligence layer via the
 * canonical BackendRouter. Returns null if the router is absent
 * (intel.provider-explicit branch never hits this code path) OR if
 * the routed backend is missing from agent.backends.
 *
 * Spec B Phase 4 (closes Phase 0 review finding I1 third instance):
 * the Phase-0 inline Array.isArray normalization is gone — the router
 * owns chain walking + availability filtering. Two distinct chains
 * that funnel to the same backend now produce identical names here
 * (the SC34/SC35 dedupe optimization stays correct).
 */
function resolveRoutedBackend(
  layer: 'sel' | 'pesl',
  deps: BuildLayerDeps
): { name: string; def: BackendDef } | null {
  const { config, router, logger } = deps;
  const backends = config.agent.backends;
  if (!backends || !router) return null;
  try {
    const decision = router.resolve({ kind: 'intelligence', layer });
    const def = backends[decision.backendName];
    if (!def) {
      logger.warn(
        `Intelligence pipeline: routed backend '${decision.backendName}' for layer '${layer}' is not in agent.backends.`
      );
      return null;
    }
    return { name: decision.backendName, def };
  } catch (err) {
    // routing.default produced no available backend (S4) — log + fall through.
    logger.warn(
      `Intelligence pipeline: router could not resolve intelligence.${layer}; intelligence disabled. error=${String(err)}`
    );
    return null;
  }
}

function buildExplicitProvider(
  provider: NonNullable<NonNullable<WorkflowConfig['intelligence']>['provider']>,
  selModel: string | undefined,
  config: WorkflowConfig
): AnalysisProvider {
  if (provider.kind === 'anthropic') {
    const apiKey = provider.apiKey ?? config.agent.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Intelligence pipeline: no Anthropic API key found.');
    }
    return new AnthropicAnalysisProvider({
      apiKey,
      ...(selModel !== undefined && { defaultModel: selModel }),
    });
  }

  if (provider.kind === 'claude-cli') {
    return new ClaudeCliAnalysisProvider({
      command: config.agent.command,
      ...(selModel !== undefined && { defaultModel: selModel }),
      ...(config.intelligence?.requestTimeoutMs !== undefined && {
        timeoutMs: config.intelligence.requestTimeoutMs,
      }),
    });
  }

  // openai-compatible
  const apiKey = provider.apiKey ?? config.agent.apiKey ?? 'ollama';
  const baseUrl = provider.baseUrl ?? 'http://localhost:11434/v1';
  const intel = config.intelligence;
  return new OpenAICompatibleAnalysisProvider({
    apiKey,
    baseUrl,
    ...(selModel !== undefined && { defaultModel: selModel }),
    ...(intel?.requestTimeoutMs !== undefined && { timeoutMs: intel.requestTimeoutMs }),
    ...(intel?.promptSuffix !== undefined && { promptSuffix: intel.promptSuffix }),
    ...(intel?.jsonMode !== undefined && { jsonMode: intel.jsonMode }),
  });
}
