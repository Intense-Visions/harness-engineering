// packages/cli/src/mcp/utils/analysis-provider.ts
//
// Shared resolver for the LLM-judgment MCP tools (`acceptance_eval`,
// `outcome_eval`). Both previously carried a byte-identical Anthropic-only
// resolver that returned null without ANTHROPIC_API_KEY — so in a FULLY-LOCAL
// run (no cloud key) the judgment degraded to an advisory stub and the tools
// were effectively inert. This resolver adds a local OpenAI-compatible fallback
// so the reasoner (or any local /v1 endpoint) can serve the verdict on-device.
//
// The orchestrator threads HARNESS_ANALYSIS_BASE_URL / _MODEL into the harness
// MCP server it injects into local backends (it already knows the reasoner's
// endpoint + model), so the fully-local path lights up without config-file
// archaeology. Absent both signals, behaviour is byte-identical to before.

type Intelligence = Record<string, unknown>;
type ProviderCtor<O> = new (opts: O) => unknown;

/** Anthropic provider when ANTHROPIC_API_KEY is present, else null. */
function makeAnthropicProvider(intelligence: Intelligence, model?: string): unknown {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const Provider = intelligence.AnthropicAnalysisProvider as
    | ProviderCtor<{ apiKey: string; defaultModel?: string }>
    | undefined;
  if (typeof Provider !== 'function') return null;
  return new Provider(model !== undefined ? { apiKey, defaultModel: model } : { apiKey });
}

/**
 * Local OpenAI-compatible provider when HARNESS_ANALYSIS_BASE_URL is set, else
 * null. `HARNESS_ANALYSIS_MODEL` names the judge (overridden by `model`);
 * `HARNESS_ANALYSIS_API_KEY` defaults to `ollama`.
 */
function makeLocalProvider(intelligence: Intelligence, model?: string): unknown {
  const baseUrl = process.env.HARNESS_ANALYSIS_BASE_URL?.trim();
  if (!baseUrl) return null;
  const Provider = intelligence.OpenAICompatibleAnalysisProvider as
    | ProviderCtor<{ apiKey: string; baseUrl: string; defaultModel?: string }>
    | undefined;
  if (typeof Provider !== 'function') return null;
  const resolvedModel = model ?? process.env.HARNESS_ANALYSIS_MODEL?.trim();
  return new Provider({
    apiKey: process.env.HARNESS_ANALYSIS_API_KEY?.trim() || 'ollama',
    baseUrl,
    ...(resolvedModel ? { defaultModel: resolvedModel } : {}),
  });
}

/**
 * Resolve a real `AnalysisProvider` (`.analyze<T>()`) for the eval tools.
 * Precedence: cloud key (Anthropic) → local `/v1` endpoint → null (the caller
 * degrades to an advisory verdict; never throws). `model` overrides
 * `HARNESS_ANALYSIS_MODEL` / the Anthropic `defaultModel` when provided.
 */
export async function resolveAnalysisProvider(model?: string): Promise<unknown> {
  try {
    const intelligence = (await import('@harness-engineering/intelligence')) as Intelligence;
    return makeAnthropicProvider(intelligence, model) ?? makeLocalProvider(intelligence, model);
  } catch {
    return null;
  }
}
