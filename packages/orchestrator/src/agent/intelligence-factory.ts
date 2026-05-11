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
import type { StructuredLogger } from '../logging/logger';

export interface IntelligenceFactoryDeps {
  config: WorkflowConfig;
  localResolvers: Map<string, LocalModelResolver>;
  logger: StructuredLogger;
}

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
  deps: IntelligenceFactoryDeps
): IntelligencePipelineBundle | null {
  const { config } = deps;
  const intel = config.intelligence;
  if (!intel?.enabled) return null;

  const selProvider = buildAnalysisProviderForLayer('sel', deps);
  if (!selProvider) return null;

  // Spec 2 SC34/SC35: when sel and pesl route to different backends,
  // build a distinct provider for the PESL layer. When they route to
  // the same backend (or pesl is unset), pass undefined so the
  // pipeline falls back to the sel provider (current behavior).
  const routing = config.agent.routing;
  const peslName = routing?.intelligence?.pesl;
  const selName = routing?.intelligence?.sel ?? routing?.default;
  const peslProvider =
    peslName !== undefined && peslName !== selName
      ? buildAnalysisProviderForLayer('pesl', deps)
      : null;

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
  deps: IntelligenceFactoryDeps
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
  const routed = resolveRoutedBackend(layer, config, logger);
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
 * Look up the routed BackendDef for an intelligence layer, falling
 * back through `routing.intelligence.<layer>` → `routing.default` → null.
 */
function resolveRoutedBackend(
  layer: 'sel' | 'pesl',
  config: WorkflowConfig,
  logger: StructuredLogger
): { name: string; def: BackendDef } | null {
  const routing = config.agent.routing;
  const backends = config.agent.backends;
  if (!routing || !backends) return null;
  const layerName = routing.intelligence?.[layer];
  const name = layerName ?? routing.default;
  const def = backends[name];
  if (!def) {
    logger.warn(
      `Intelligence pipeline: routed backend '${name}' for layer '${layer}' is not in agent.backends.`
    );
    return null;
  }
  return { name, def };
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
