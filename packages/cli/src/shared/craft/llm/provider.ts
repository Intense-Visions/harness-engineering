// packages/cli/src/shared/craft/llm/provider.ts
//
// Shared LLM provider adapter for the craft skill family.

import { InSessionLlmProvider } from './in-session.js';
import { adaptAnthropic, adaptClaudeCli, adaptOpenAICompatible } from './adapters.js';
import { LazyLocalAdapter } from './lazy-local-adapter.js';
import {
  AnthropicAnalysisProvider,
  ClaudeCliAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
} from '@harness-engineering/intelligence';
import { findConfigFile, loadConfig } from '../../../config/loader.js';
import { readBackendsFromOrchestratorMd } from './orchestrator-md.js';

export { InSessionLlmProvider, PromptDeferredError } from './in-session.js';
export type { DeferredPrompt } from './in-session.js';
export {
  AnalysisProviderAdapter,
  adaptAnthropic,
  adaptClaudeCli,
  adaptOpenAICompatible,
} from './adapters.js';
export { LazyLocalAdapter } from './lazy-local-adapter.js';
export type { LazyLocalAdapterOptions } from './lazy-local-adapter.js';
//
// Extracted from packages/cli/src/design-craft/llm/provider.ts on the
// 2nd-non-design-craft-consumer trigger (spec-craft). naming-craft and
// design-craft both re-export from here so a single canonical surface
// is maintained.
//
// MVP scope:
//   - `LlmProvider` interface that craft phases consume.
//   - `MockLlmProvider` deterministic mock for tests.
//   - `getProvider({ provider, model })` returns the mock for now and
//     records a TODO for the real integration.
//
// `getProvider` dispatches on configuration so consumers can opt into
// different backends without code changes. Resolution order:
//
//   1. Explicit opts.mode  (test code / programmatic override)
//   2. HARNESS_CRAFT_LLM   (env var — CI / test isolation escape hatch)
//   3. harness.config.json → craft.llm.provider  (canonical user config)
//   4. Built-in default: in-session
//
// Modes:
//   in-session  → host-chat performs judgment (default)
//   claude-cli  → shell out to local `claude` CLI
//   anthropic   → direct Anthropic API (requires ANTHROPIC_API_KEY)
//   mock        → deterministic mock (tests + smoke runs)
//
// In-session is the default: when a craft skill runs from inside a Claude
// Code chat, prompts are deferred back to the host model via a two-step
// MCP flow (`<skill>` collects prompts → host answers → `<skill>_finalize`
// stitches findings). See in-session.ts for the sentinel-throw mechanism
// and the naming-craft orchestrator for the consumer pattern.
//
// Honors ADR 0018 (LLM-judgment skill pattern):
//   - `recordCost` is a first-class method so every skill invocation
//     surfaces aggregate cost.
//   - `callText` and `callVision` are separate so vision calls can be
//     gated on `mode: 'deep'` and tracked as a distinct cost line.

/** Aggregate cost / token usage for one LLM call. */
export interface LlmCallCost {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Optional vision input (image bytes or URL) for `callVision`. */
export interface VisionInput {
  imageUrl?: string;
  imageBuffer?: Buffer;
  mediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface LlmProvider {
  readonly providerId: string;
  readonly model: string;

  /**
   * Free-form text completion. Returns the raw assistant text — the caller
   * is responsible for parsing fenced JSON / structured content.
   */
  callText(prompt: string, opts?: { systemPrompt?: string }): Promise<string>;

  /**
   * Vision-capable completion. Phase 1 MVP does not wire this through;
   * the mock throws so consumers in fast mode never accidentally hit it.
   */
  callVision(prompt: string, image: VisionInput, opts?: { systemPrompt?: string }): Promise<string>;

  /** Side-effect: append a cost entry. */
  recordCost(cost: LlmCallCost): void;
}

/**
 * Deterministic mock provider used by tests + as the default `getProvider`
 * return until the real intelligence-package integration lands.
 *
 * `callText` returns a fixed fenced-JSON response shaped to satisfy a
 * craft-phase parser. Tests can override the response via the
 * constructor's `responses` map (keyed by substring match on the prompt).
 *
 * The default response emits `confidence: 'low'` so the integration test
 * can assert ADR 0019's "confidence is honest" property — a mock that
 * always returned `high` would let the contract regress silently.
 */
export class MockLlmProvider implements LlmProvider {
  readonly providerId = 'mock';
  readonly model = 'mock-text-deterministic-1';

  private readonly costs: LlmCallCost[] = [];

  constructor(
    private readonly responses: Array<{
      /** Substring match against the prompt. First hit wins. */
      promptIncludes: string;
      response: string;
    }> = []
  ) {}

  async callText(prompt: string, _opts?: { systemPrompt?: string }): Promise<string> {
    this.recordCost({
      provider: this.providerId,
      model: this.model,
      inputTokens: prompt.length,
      outputTokens: 200,
      costUsd: 0,
    });

    const hit = this.responses.find((r) => prompt.includes(r.promptIncludes));
    if (hit) return hit.response;

    return [
      '```json',
      JSON.stringify(
        {
          tier: 'foundational',
          impact: 'medium',
          confidence: 'low',
          message:
            'Mock provider default response: target appears to lack a clear primary signal among its top-level interactive elements, but the code-only view leaves the actual rendered weights ambiguous. Confidence is low.',
        },
        null,
        2
      ),
      '```',
    ].join('\n');
  }

  async callVision(): Promise<string> {
    throw new Error(
      'MockLlmProvider.callVision not implemented — vision pipeline is Phase 2 work.'
    );
  }

  recordCost(cost: LlmCallCost): void {
    this.costs.push(cost);
  }

  /** Test-only — read back accumulated cost entries. */
  getCosts(): readonly LlmCallCost[] {
    return this.costs;
  }
}

/**
 * The provider modes the craft selector ultimately picks. Notice that
 * backend-typed modes (anthropic/openai/local/...) come from a named
 * entry in `agent.backends`, not from craft config itself.
 */
export type CraftLlmMode =
  | 'in-session'
  | 'mock'
  | 'claude'
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'local'
  | 'pi';

export interface CraftLlmResolution {
  mode: CraftLlmMode;
  /** Populated when the selection came from agent.backends[<backend>]. */
  backendName?: string;
  /** The backend definition copied from agent.backends, if applicable. */
  backendDef?: Record<string, unknown>;
}

function hasEnvValue(raw: string): boolean {
  return raw.length > 0;
}

/**
 * Resolve the active provider selection. Precedence:
 *   1. opts.mode  (explicit override — test code / programmatic)
 *   2. HARNESS_CRAFT_LLM env  (CI / test escape hatch). Values:
 *        'in-session', 'mock', or the name of an entry in agent.backends.
 *   3. craft.llm.backend  → look up agent.backends[name]
 *   4. craft.llm.mode     → 'in-session' | 'mock'
 *   5. Built-in default: in-session
 */
export function resolveCraftLlmConfig(opts: { projectRoot?: string } = {}): CraftLlmResolution {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const fileConfig = readCraftConfigFromFile(projectRoot);
  const envRaw = (process.env.HARNESS_CRAFT_LLM ?? '').trim();

  // Env override: 'in-session' / 'mock' / <backend-name>.
  if (hasEnvValue(envRaw)) {
    if (envRaw === 'in-session' || envRaw === 'mock') {
      return { mode: envRaw };
    }
    const def = fileConfig?.backends?.[envRaw];
    if (def !== undefined && typeof def === 'object' && def !== null) {
      const backendDef = def as Record<string, unknown>;
      const type = backendDef.type;
      if (typeof type === 'string' && isBackendType(type)) {
        return { mode: type, backendName: envRaw, backendDef };
      }
    }
    // Fall through to config-file resolution if the env value doesn't match a known backend.
  }

  // Config-file resolution.
  const backendName = fileConfig?.craft?.backend;
  if (fileConfig !== null && typeof backendName === 'string' && backendName.length > 0) {
    const def = fileConfig.backends?.[backendName];
    if (def === undefined || typeof def !== 'object' || def === null) {
      throw new Error(
        `craft.llm.backend="${backendName}" references an entry that is missing from agent.backends.`
      );
    }
    const backendDef = def as Record<string, unknown>;
    const type = backendDef.type;
    if (typeof type !== 'string' || !isBackendType(type)) {
      throw new Error(
        `agent.backends["${backendName}"] has unsupported type "${String(type)}" for craft skills.`
      );
    }
    return { mode: type, backendName, backendDef };
  }

  const mode = fileConfig?.craft?.mode;
  if (mode === 'in-session' || mode === 'mock') return { mode };

  return { mode: 'in-session' };
}

/** Back-compat shim — returns only the mode. */
export function resolveCraftLlmMode(envValue?: string): CraftLlmMode {
  if (envValue !== undefined) {
    const trimmed = envValue.trim();
    if (trimmed === 'in-session' || trimmed === 'mock') return trimmed;
  }
  return resolveCraftLlmConfig().mode;
}

const BACKEND_TYPES = ['claude', 'anthropic', 'openai', 'gemini', 'local', 'pi', 'mock'] as const;
function isBackendType(t: string): t is (typeof BACKEND_TYPES)[number] {
  return (BACKEND_TYPES as readonly string[]).includes(t);
}

interface FileCraftView {
  craft?: { backend?: string; mode?: 'in-session' | 'mock' };
  backends?: Record<string, unknown>;
  /** Set when backends were sourced from harness.orchestrator.md, not harness.config.json. */
  backendsFromOrchestratorMd?: boolean;
}

function readJsonCraftView(startDir: string): FileCraftView {
  const view: FileCraftView = {};
  const found = findConfigFile(startDir);
  if (!found.ok) return view;
  const loaded = loadConfig(found.value);
  if (!loaded.ok) return view;
  const craft = loaded.value.craft?.llm;
  if (craft !== undefined) {
    view.craft = {};
    if (craft.backend !== undefined) view.craft.backend = craft.backend;
    if (craft.mode !== undefined) view.craft.mode = craft.mode;
  }
  const backends = loaded.value.agent?.backends;
  if (backends !== undefined) view.backends = backends as Record<string, unknown>;
  return view;
}

function readCraftConfigFromFile(startDir: string): FileCraftView | null {
  const view = readJsonCraftView(startDir);

  // Migration: if harness.config.json didn't declare agent.backends, fall
  // back to harness.orchestrator.md so users who already maintain backends
  // there don't have to duplicate them. Emits a one-time deprecation
  // warning so they know to migrate.
  if (view.backends === undefined) {
    const fromMd = readBackendsFromOrchestratorMd(startDir);
    if (fromMd !== null) {
      view.backends = fromMd;
      view.backendsFromOrchestratorMd = true;
      warnOrchestratorMdFallback();
    }
  }

  return view.craft !== undefined || view.backends !== undefined ? view : null;
}

let warnedOrchestratorMd = false;
function warnOrchestratorMdFallback(): void {
  if (warnedOrchestratorMd) return;
  warnedOrchestratorMd = true;
  if (process.env.HARNESS_SUPPRESS_BACKEND_MIGRATION_WARNING) return;
  console.warn(
    '[craft] agent.backends read from harness.orchestrator.md. ' +
      'Run `harness migrate backends` to copy them into harness.config.json ' +
      '(single source of truth). Suppress with HARNESS_SUPPRESS_BACKEND_MIGRATION_WARNING=1.'
  );
}

/**
 * Factory for the provider used by phase implementations. Dispatch and
 * provider-specific settings flow from {@link resolveCraftLlmConfig}.
 *
 * Test code that wants a specific provider should construct it directly
 * (MockLlmProvider, InSessionLlmProvider) rather than going through here.
 */
export function getProvider(opts?: {
  mode?: 'in-session' | 'mock';
  projectRoot?: string;
}): LlmProvider {
  // Explicit override — only the two non-backend modes can be forced via
  // opts.mode (backend-typed modes need an agent.backends entry).
  if (opts?.mode === 'in-session') return new InSessionLlmProvider();
  if (opts?.mode === 'mock') return new MockLlmProvider();

  const resolved = resolveCraftLlmConfig(
    opts?.projectRoot !== undefined ? { projectRoot: opts.projectRoot } : {}
  );
  return providerForResolution(resolved);
}

function providerForResolution(resolved: CraftLlmResolution): LlmProvider {
  switch (resolved.mode) {
    case 'in-session':
      return new InSessionLlmProvider();
    case 'mock':
      return new MockLlmProvider();
    case 'claude':
      return buildClaudeProvider(resolved);
    case 'anthropic':
      return buildAnthropicProvider(resolved);
    case 'openai':
    case 'local':
    case 'pi':
      return buildOpenAICompatibleProvider(resolved);
    case 'gemini':
      throw new Error(
        `agent.backends["${resolved.backendName}"]: 'gemini' backend is not yet wired into the craft adapter.`
      );
  }
}

function buildClaudeProvider(resolved: CraftLlmResolution): LlmProvider {
  const def = resolved.backendDef ?? {};
  const command = stringField(def, 'command');
  return adaptClaudeCli(new ClaudeCliAnalysisProvider(command !== undefined ? { command } : {}));
}

function buildAnthropicProvider(resolved: CraftLlmResolution): LlmProvider {
  const def = resolved.backendDef ?? {};
  const model = stringField(def, 'model');
  if (model === undefined) {
    throw new Error(
      `agent.backends["${resolved.backendName}"]: 'anthropic' backend requires a 'model'.`
    );
  }
  const apiKey = stringField(def, 'apiKey') ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      `agent.backends["${resolved.backendName}"]: 'anthropic' backend requires apiKey or ANTHROPIC_API_KEY.`
    );
  }
  return adaptAnthropic(new AnthropicAnalysisProvider({ apiKey, defaultModel: model }), model);
}

function pickConfiguredModels(modelField: unknown): string[] {
  if (typeof modelField === 'string') return [modelField];
  if (Array.isArray(modelField)) {
    return modelField.filter((m): m is string => typeof m === 'string');
  }
  return [];
}

interface OpenAICompatibleInputs {
  endpoint: string;
  apiKey: string;
  configured: string[];
}

function resolveOpenAICompatibleEndpoint(resolved: CraftLlmResolution): string {
  const def = resolved.backendDef ?? {};
  const fallback = resolved.mode === 'openai' ? 'https://api.openai.com/v1' : undefined;
  const endpoint = stringField(def, 'endpoint') ?? fallback;
  if (endpoint === undefined) {
    throw new Error(
      `agent.backends["${resolved.backendName}"]: '${resolved.mode}' backend requires 'endpoint'.`
    );
  }
  return endpoint;
}

function resolveOpenAICompatibleApiKey(resolved: CraftLlmResolution): string {
  const def = resolved.backendDef ?? {};
  const fallback = resolved.mode === 'openai' ? undefined : 'local';
  const apiKey = stringField(def, 'apiKey') ?? process.env.OPENAI_API_KEY ?? fallback;
  if (!apiKey) {
    throw new Error(
      `agent.backends["${resolved.backendName}"]: 'openai' backend requires apiKey or OPENAI_API_KEY.`
    );
  }
  return apiKey;
}

function resolveOpenAICompatibleInputs(resolved: CraftLlmResolution): OpenAICompatibleInputs {
  const configured = pickConfiguredModels(resolved.backendDef?.model);
  if (configured.length === 0) {
    throw new Error(
      `agent.backends["${resolved.backendName}"]: '${resolved.mode}' backend requires 'model' (string or non-empty array of strings).`
    );
  }
  return {
    endpoint: resolveOpenAICompatibleEndpoint(resolved),
    apiKey: resolveOpenAICompatibleApiKey(resolved),
    configured,
  };
}

function buildOpenAICompatibleProvider(resolved: CraftLlmResolution): LlmProvider {
  const { endpoint, apiKey, configured } = resolveOpenAICompatibleInputs(resolved);

  // Single configured model → direct adapter, no probe (cheaper, predictable).
  if (configured.length === 1) {
    return adaptOpenAICompatible(
      new OpenAICompatibleAnalysisProvider({
        apiKey,
        baseUrl: endpoint,
        defaultModel: configured[0]!,
      }),
      configured[0]!
    );
  }

  // Multiple configured models → lazy probe on first callText.
  return new LazyLocalAdapter(
    { endpoint, apiKey, configured },
    resolved.mode === 'pi' ? 'pi' : 'local'
  );
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}
