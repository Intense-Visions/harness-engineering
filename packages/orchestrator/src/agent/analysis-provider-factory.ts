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

/**
 * Snapshot of a LocalModelResolver's current status — the subset of
 * `LocalModelStatus` the factory needs for `local`/`pi` provider
 * construction and the unavailable-warn diagnostic.
 *
 * Intentionally a flat record (not the full LocalModelStatus) to keep
 * this module dependency-free of `@harness-engineering/types`. Callers
 * derive this from `resolver.getStatus()` in a single read.
 */
export interface ResolverStatusSnapshot {
  /** Whether the resolver currently considers the local backend reachable + a configured model loaded. */
  available: boolean;
  /** Resolver's currently-resolved model name, or null when unresolved. */
  resolved: string | null;
  /** Configured models the resolver was constructed with (for operator triage in warns). */
  configured: string[];
  /** Models the local endpoint actually reported on the last probe (for operator triage in warns). */
  detected: string[];
}

export interface BuildAnalysisProviderArgs {
  /** The routed BackendDef whose type drives provider selection. */
  def: BackendDef;
  /** The routed backend name (key in agent.backends). Used for log labels + the warn payload. */
  backendName: string;
  /** Which intelligence layer this provider serves. Influences warn wording. */
  layer: IntelligenceLayer;
  /**
   * Resolver hook: returns a snapshot of the resolver's current status
   * for `local`/`pi` types. Returns null when no resolver is registered
   * for this backend (e.g., the routed backend isn't a local-like one,
   * or the orchestrator hasn't constructed a resolver for it).
   *
   * A single snapshot read collapses what would otherwise be two
   * `getStatus()` calls (one for `available`, one for `resolved`) and
   * makes the configured/detected lists available to the
   * unavailable-warn diagnostic (Spec 2 P3-IMP-1).
   */
  getResolverStatusSnapshot: () => ResolverStatusSnapshot | null;
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
  const { backendName, getResolverStatusSnapshot, intelligence, logger } = args;
  // Single snapshot read — collapses what was previously two `getStatus()`
  // calls (one for `available`, one for `resolved`) and feeds the
  // configured/detected diagnostic lists into the unavailable warn.
  const snapshot = getResolverStatusSnapshot();
  if (!snapshot || !snapshot.available) {
    // Spec 2 P3-IMP-1: include the Configured/Detected lists so operators
    // triaging a misconfigured local backend see at-a-glance which models
    // were configured vs. what the endpoint actually reported. Mirrors the
    // pre-Phase-4 wording at orchestrator.ts:621-624.
    const configured = snapshot?.configured ?? [];
    const detected = snapshot?.detected ?? [];
    logger.warn(
      `Intelligence pipeline disabled for backend '${backendName}' at ${def.endpoint}: ` +
        `no configured local model loaded. ` +
        `Configured: [${configured.join(', ')}]. ` +
        `Detected: [${detected.join(', ')}].`
    );
    return null;
  }
  const model = layerModel ?? snapshot.resolved ?? undefined;
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
