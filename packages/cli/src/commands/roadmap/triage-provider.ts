// packages/cli/src/commands/roadmap/triage-provider.ts
//
// Roadmap Auto-Triage — the SEL AnalysisProvider resolver for the CLI brainstorm/approve path.
//
// The feature premise is that triage runs on the FREE LOCAL model (proposal §"runs on the free
// local model"). The earlier draft hardcoded an AnthropicAnalysisProvider from ANTHROPIC_API_KEY
// — a paid cloud model — which contradicts that premise and silently billed. This resolver
// mirrors how the orchestrator resolves the SEL layer (`buildAnalysisProviderForLayer('sel', …)`
// → `agent.backends` → an OpenAI-compatible local endpoint), so the CLI and orchestrator agree
// on the SAME backend.
//
// Resolution order (SEL layer):
//   1. Explicit opt-in override: `intelligence.provider` (kind: anthropic | openai-compatible)
//      — the ONLY way to reach a cloud/paid model. Anthropic is never the silent default.
//   2. The `local`/`pi` entry in `agent.backends` → OpenAICompatibleAnalysisProvider against
//      its endpoint (the free-local default).
//   3. An explicit `anthropic`/`openai` entry in `agent.backends` (a deliberate config choice).
//   4. No resolvable provider → `null`. The brainstorm then HALTS every item to a human — the
//      preserved fail-safe (never a silent pass without a model).

import {
  AnthropicAnalysisProvider,
  OpenAICompatibleAnalysisProvider,
  type AnalysisProvider,
} from '@harness-engineering/intelligence';

/** Minimal backend-def view this resolver reads (structural — avoids importing the full union). */
interface BackendView {
  type?: string;
  endpoint?: string;
  model?: string | string[];
  apiKey?: string;
  timeoutMs?: number;
}

/** The config surface the resolver consults (a structural subset of HarnessConfig). */
export interface TriageProviderConfig {
  agent?: {
    backends?: Record<string, BackendView>;
  };
  /**
   * Explicit intelligence-provider opt-in. When set, this WINS — the only path to a cloud/paid
   * model (Anthropic/OpenAI-compatible). Absent ⇒ the local backend is used. Mirrors the
   * orchestrator's `intelligence.provider` override, kept optional so most adopters never set it.
   */
  intelligence?: {
    provider?: {
      kind: 'anthropic' | 'openai-compatible';
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
  };
}

/** First model name from a `string | string[]` model field. */
function firstModel(model: string | string[] | undefined): string | undefined {
  if (Array.isArray(model)) return model[0];
  return model;
}

/**
 * Resolve the SEL AnalysisProvider for the CLI brainstorm from config. Returns `null` when no
 * provider can be resolved — the caller then halts every item to a human (fail-safe). Pure over
 * the injected config + environment; no filesystem or network IO.
 *
 * @param config  The resolved HarnessConfig (structural subset).
 * @param modelOverride  Optional model name to pin (e.g. from a `--model` flag).
 */
export function resolveTriageProvider(
  config: TriageProviderConfig | undefined,
  modelOverride?: string
): AnalysisProvider | null {
  // 1. Explicit intelligence.provider opt-in (the only route to a cloud/paid model).
  const explicit = config?.intelligence?.provider;
  if (explicit) {
    if (explicit.kind === 'anthropic') {
      const apiKey = explicit.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null; // opt-in but no key ⇒ fail-safe to human, never a silent pass.
      const model = modelOverride ?? explicit.model;
      return new AnthropicAnalysisProvider(
        model !== undefined ? { apiKey, defaultModel: model } : { apiKey }
      );
    }
    // openai-compatible explicit override (e.g. a remote OpenAI-compatible gateway).
    const baseUrl = explicit.baseUrl ?? 'http://localhost:11434/v1';
    const model = modelOverride ?? explicit.model;
    return new OpenAICompatibleAnalysisProvider({
      apiKey: explicit.apiKey ?? 'ollama',
      baseUrl,
      ...(model !== undefined && { defaultModel: model }),
    });
  }

  // 2 + 3. Resolve from agent.backends. Prefer a local/pi (free, OpenAI-compatible local
  //         endpoint) — the feature premise — then fall back to an explicit anthropic/openai.
  const backends = config?.agent?.backends;
  if (!backends) return null;

  const local = pickBackend(backends, ['local', 'pi']);
  if (local && local.endpoint) {
    const model = modelOverride ?? firstModel(local.model);
    return new OpenAICompatibleAnalysisProvider({
      apiKey: local.apiKey ?? 'ollama',
      baseUrl: local.endpoint,
      ...(model !== undefined && { defaultModel: model }),
      ...(local.timeoutMs !== undefined && { timeoutMs: local.timeoutMs }),
    });
  }

  const anthropic = pickBackend(backends, ['anthropic']);
  if (anthropic) {
    const apiKey = anthropic.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const model = modelOverride ?? firstModel(anthropic.model);
    return new AnthropicAnalysisProvider(
      model !== undefined ? { apiKey, defaultModel: model } : { apiKey }
    );
  }

  // 4. Nothing resolvable ⇒ null ⇒ every item halts to a human (fail-safe).
  return null;
}

/** Return the first backend entry whose `type` matches one of `types` (config-order-stable). */
function pickBackend(
  backends: Record<string, BackendView>,
  types: readonly string[]
): BackendView | null {
  for (const def of Object.values(backends)) {
    if (def.type !== undefined && types.includes(def.type)) return def;
  }
  return null;
}
