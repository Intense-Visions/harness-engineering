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
//
// D8 (ADR 0106): a `claude`-CLI subscription step is APPENDED LAST to the
// precedence chain — Anthropic key → local `/v1` → `claude`-CLI → null. It is
// strictly additive: every environment that resolved a provider before resolves
// the SAME one now. The only newly-covered environment is "no key + no local
// endpoint + `claude` on PATH", which previously degraded to null and now gets a
// real ClaudeCliAnalysisProvider (subscription auth, no API key). This closes
// SC5's subscription gap for `acceptance_eval`/`outcome_eval` and comprehension's
// `generateSemantic`.

import { existsSync } from 'node:fs';
import path from 'node:path';

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
function makeLocalProvider(
  intelligence: Intelligence,
  model?: string,
  override?: AnalysisEndpoint
): unknown {
  // A config-declared endpoint (ADR 0109 slice 3) wins over the orchestrator-
  // injected env, so an adopter can point the comprehension backstop at ANY
  // vendor's OpenAI-compatible gateway (Cursor/Codex/Gemini/local model) without
  // an Anthropic key or env archaeology. Env remains the fallback (unchanged).
  const baseUrl = override?.baseUrl?.trim() || process.env.HARNESS_ANALYSIS_BASE_URL?.trim();
  if (!baseUrl) return null;
  const Provider = intelligence.OpenAICompatibleAnalysisProvider as
    | ProviderCtor<{ apiKey: string; baseUrl: string; defaultModel?: string }>
    | undefined;
  if (typeof Provider !== 'function') return null;
  const resolvedModel = model ?? process.env.HARNESS_ANALYSIS_MODEL?.trim();
  return new Provider({
    apiKey: override?.apiKey?.trim() || process.env.HARNESS_ANALYSIS_API_KEY?.trim() || 'ollama',
    baseUrl,
    ...(resolvedModel ? { defaultModel: resolvedModel } : {}),
  });
}

/**
 * Options for {@link isClaudeCliAvailable}. All injectable so the PATH scan is
 * fully deterministic in tests (never depends on the host actually having
 * `claude` installed, its real `PATH`, or the host OS).
 */
export interface ClaudeCliDetectOpts {
  /** Environment to scan (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Existence probe (defaults to `node:fs` `existsSync`). */
  fileExists?: (p: string) => boolean;
  /** Host platform (defaults to `process.platform`) — selects delimiter + PATHEXT. */
  platform?: NodeJS.Platform;
}

/**
 * True when a `claude` executable is resolvable on PATH. Windows-safe: on win32
 * it splits PATH with `;` and tries each `PATHEXT` extension (`.CMD`/`.EXE`/…);
 * on POSIX it splits with `:` and probes the bare `claude`. Injectable
 * (`env`/`fileExists`/`platform`) so tests are deterministic on any host.
 */
export function isClaudeCliAvailable(opts: ClaudeCliDetectOpts = {}): boolean {
  const env = opts.env ?? process.env;
  const exists = opts.fileExists ?? existsSync;
  const platform = opts.platform ?? process.platform;
  const isWin = platform === 'win32';
  const p = isWin ? path.win32 : path.posix;
  const pathVar = env.PATH ?? env.Path ?? '';
  if (!pathVar.trim()) return false;
  const exts = isWin ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const dir of pathVar.split(p.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      if (exists(p.join(dir, `claude${ext}`))) return true;
    }
  }
  return false;
}

/**
 * claude-CLI provider (subscription auth, no API key) when `claude` is on PATH,
 * else null. Mirrors {@link makeAnthropicProvider}/{@link makeLocalProvider}.
 */
function makeClaudeCliProvider(
  intelligence: Intelligence,
  model: string | undefined,
  available: boolean
): unknown {
  if (!available) return null;
  const Provider = intelligence.ClaudeCliAnalysisProvider as
    | ProviderCtor<{ defaultModel?: string }>
    | undefined;
  if (typeof Provider !== 'function') return null;
  return new Provider(model !== undefined ? { defaultModel: model } : {});
}

/**
 * Resolve a real `AnalysisProvider` (`.analyze<T>()`) for the eval tools and
 * comprehension. Precedence: cloud key (Anthropic) → local `/v1` endpoint →
 * `claude`-CLI subscription (D8, appended LAST) → null (the caller degrades to
 * an advisory/static-only path; never throws). `model` overrides
 * `HARNESS_ANALYSIS_MODEL` / the provider `defaultModel` when provided.
 * `opts.isClaudeCliAvailable` is injectable for deterministic tests.
 */
/** Which provider `resolveAnalysisProvider` will construct for the current env. */
export type ProviderKind = 'anthropic' | 'local' | 'claude-cli' | null;

/**
 * A config-declared OpenAI-compatible analysis endpoint (ADR 0109 slice 3). This
 * is the provider-NEUTRAL escape hatch: any vendor (Cursor/Codex/Gemini/a local
 * model) can power the comprehension backstop through its own gateway, declared in
 * `comprehension` config rather than requiring an Anthropic key or the
 * orchestrator-injected `HARNESS_ANALYSIS_*` env. When absent, env is the fallback.
 */
export interface AnalysisEndpoint {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
}

/**
 * Report the provider `resolveAnalysisProvider` would resolve for the current
 * environment, WITHOUT constructing it. MUST mirror the precedence in
 * `resolveAnalysisProvider` (Anthropic key → local `/v1` → `claude`-CLI → null);
 * the `providerKind matches resolveAnalysisProvider precedence` test guards them
 * against drift. Callers use this to pick a provider-appropriate default model:
 * a Claude-family provider (`anthropic`/`claude-cli`) wants a cheap Claude id,
 * whereas a `local` OpenAI-compatible endpoint must use ITS OWN configured model
 * (`HARNESS_ANALYSIS_MODEL`) — forcing a Claude id onto it fails.
 */
export function resolveProviderKind(
  opts: {
    isClaudeCliAvailable?: () => boolean;
    env?: NodeJS.ProcessEnv;
    endpoint?: AnalysisEndpoint;
  } = {}
): ProviderKind {
  const env = opts.env ?? process.env;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  // A config-declared endpoint counts as `local` even when the env is unset.
  if (opts.endpoint?.baseUrl?.trim() || env.HARNESS_ANALYSIS_BASE_URL?.trim()) return 'local';
  const claudeAvailable = (opts.isClaudeCliAvailable ?? (() => isClaudeCliAvailable()))();
  return claudeAvailable ? 'claude-cli' : null;
}

export async function resolveAnalysisProvider(
  model?: string,
  opts: { isClaudeCliAvailable?: () => boolean; endpoint?: AnalysisEndpoint } = {}
): Promise<unknown> {
  try {
    const intelligence = (await import('@harness-engineering/intelligence')) as Intelligence;
    const claudeAvailable = (opts.isClaudeCliAvailable ?? (() => isClaudeCliAvailable()))();
    return (
      makeAnthropicProvider(intelligence, model) ??
      makeLocalProvider(intelligence, model, opts.endpoint) ??
      makeClaudeCliProvider(intelligence, model, claudeAvailable)
    );
  } catch {
    return null;
  }
}
