import type { AnalysisProvider } from '@harness-engineering/intelligence';
import {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import type { BackendDef, IntelligenceConfig } from '@harness-engineering/types';

/** Layer the routed provider serves (used for log labelling). */
export type IntelligenceLayer = 'sel' | 'pesl';

/**
 * Lightweight logger contract — matches the orchestrator's `Logger`
 * shape without importing it (keeps this module dependency-free).
 */
export interface ProviderFactoryLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

export interface BuildAnalysisProviderArgs {
  /** The routed BackendDef whose type drives provider selection. */
  def: BackendDef;
  /** The routed backend name (key in agent.backends). Used for log labels + the warn payload. */
  backendName: string;
  /** Which intelligence layer this provider serves. Influences warn wording. */
  layer: IntelligenceLayer;
  /** Resolver hook: returns the currently-resolved model name for `local`/`pi` types, or null when unresolved. */
  getResolvedModel: () => string | null;
  /** Resolver hook: returns whether the resolver believes the local backend is reachable. */
  getResolverAvailable: () => boolean;
  /** Intelligence config — provides selModel/peslModel overrides + transport options. */
  intelligence: IntelligenceConfig | undefined;
  /** Logger for info/warn emission. */
  logger: ProviderFactoryLogger;
}

/**
 * Translate a routed `BackendDef` into an `AnalysisProvider` for the
 * intelligence pipeline (Spec 2 SC31–SC36).
 *
 * Resolution per type:
 * - `local` / `pi`  → OpenAICompatibleAnalysisProvider (resolver-aware
 *                     model). Returns null + warns when the resolver
 *                     is unavailable.
 * - `anthropic`     → AnthropicAnalysisProvider when an API key is
 *                     present (cfg or ANTHROPIC_API_KEY env), else
 *                     ClaudeCliAnalysisProvider fallback.
 * - `openai`        → OpenAICompatibleAnalysisProvider with cloud
 *                     baseUrl when an API key is present (cfg or
 *                     OPENAI_API_KEY env), else null + warn.
 * - `claude`        → ClaudeCliAnalysisProvider (subscription auth;
 *                     no API key needed).
 * - `mock`          → null + warn (SC36).
 * - `gemini`        → null + warn (no GeminiAnalysisProvider exists yet).
 *
 * Replaces the per-type cyclomatic-complexity-33 branch tree previously
 * inlined in `Orchestrator.createAnalysisProvider`. Each branch is a
 * small named helper — the dispatch is a single switch on `def.type`.
 */
export function buildAnalysisProvider(args: BuildAnalysisProviderArgs): AnalysisProvider | null {
  const { def, backendName, layer, intelligence, logger } = args;
  const layerModel = layer === 'sel' ? intelligence?.models?.sel : intelligence?.models?.pesl;

  switch (def.type) {
    case 'local':
    case 'pi':
      return buildLocalLikeProvider(def, args, layerModel);
    case 'anthropic':
      return buildAnthropicProvider(def, args, layerModel);
    case 'openai':
      return buildOpenAIProvider(def, args, layerModel);
    case 'claude':
      return buildClaudeCliProvider(def, args, layerModel);
    case 'mock':
    case 'gemini':
      logger.warn(
        `Intelligence pipeline disabled for layer '${layer}': routed backend '${backendName}' has type '${def.type}' which has no AnalysisProvider implementation.`
      );
      return null;
  }
}

function buildLocalLikeProvider(
  def: Extract<BackendDef, { type: 'local' | 'pi' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider | null {
  const { backendName, getResolvedModel, getResolverAvailable, intelligence, logger } = args;
  if (!getResolverAvailable()) {
    logger.warn(
      `Intelligence pipeline disabled for backend '${backendName}' at ${def.endpoint}: ` +
        `no configured local model loaded.`
    );
    return null;
  }
  const resolved = getResolvedModel();
  const model = layerModel ?? resolved ?? undefined;
  const apiKey = def.apiKey ?? 'ollama';
  logger.info(
    `Intelligence pipeline using backend '${backendName}' (${def.type}) at ${def.endpoint} (model: ${model ?? '(default)'})`
  );
  return new OpenAICompatibleAnalysisProvider({
    apiKey,
    baseUrl: def.endpoint,
    ...(model !== undefined && { defaultModel: model }),
    ...(intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: intelligence.requestTimeoutMs,
    }),
    ...(intelligence?.promptSuffix !== undefined && { promptSuffix: intelligence.promptSuffix }),
    ...(intelligence?.jsonMode !== undefined && { jsonMode: intelligence.jsonMode }),
  });
}

function buildAnthropicProvider(
  def: Extract<BackendDef, { type: 'anthropic' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider {
  const apiKey = def.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = layerModel ?? def.model;
  if (apiKey) {
    return new AnthropicAnalysisProvider({
      apiKey,
      ...(model !== undefined && { defaultModel: model }),
    });
  }
  // Fall through to Claude CLI when no key is configured (preserves
  // today's primary-fallback behavior at orchestrator.ts:670-676).
  args.logger.info(
    `Intelligence pipeline routed to '${args.backendName}' (anthropic) without API key — using Claude CLI fallback.`
  );
  return new ClaudeCliAnalysisProvider({
    ...(model !== undefined && { defaultModel: model }),
    ...(args.intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: args.intelligence.requestTimeoutMs,
    }),
  });
}

function buildOpenAIProvider(
  def: Extract<BackendDef, { type: 'openai' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider | null {
  const apiKey = def.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    args.logger.warn(
      `Intelligence pipeline disabled for backend '${args.backendName}' (openai): no API key configured.`
    );
    return null;
  }
  const model = layerModel ?? def.model;
  return new OpenAICompatibleAnalysisProvider({
    apiKey,
    baseUrl: 'https://api.openai.com/v1',
    ...(model !== undefined && { defaultModel: model }),
    ...(args.intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: args.intelligence.requestTimeoutMs,
    }),
  });
}

function buildClaudeCliProvider(
  def: Extract<BackendDef, { type: 'claude' }>,
  args: BuildAnalysisProviderArgs,
  layerModel: string | undefined
): AnalysisProvider {
  return new ClaudeCliAnalysisProvider({
    ...(def.command !== undefined && { command: def.command }),
    ...(layerModel !== undefined && { defaultModel: layerModel }),
    ...(args.intelligence?.requestTimeoutMs !== undefined && {
      timeoutMs: args.intelligence.requestTimeoutMs,
    }),
  });
}
