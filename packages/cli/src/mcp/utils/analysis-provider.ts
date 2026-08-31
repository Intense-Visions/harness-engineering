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
 * Options for {@link isClaudeCliAvailable} / {@link isCliAvailable}. All
 * injectable so the PATH scan is fully deterministic in tests (never depends on
 * the host actually having the binary installed, its real `PATH`, or the host OS).
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
 * True when `command` is resolvable on PATH. Windows-safe: on win32 it splits
 * PATH with `;` and tries each `PATHEXT` extension (`.CMD`/`.EXE`/…); on POSIX it
 * splits with `:` and probes the bare command. An absolute/relative path
 * (containing a separator) is probed directly, PATHEXT-aware on win32. Injectable
 * (`env`/`fileExists`/`platform`) so tests are deterministic on any host.
 */
export function isCliAvailable(command: string, opts: ClaudeCliDetectOpts = {}): boolean {
  if (!command) return false;
  const exists = opts.fileExists ?? existsSync;
  const platform = opts.platform ?? process.platform;
  const isWin = platform === 'win32';
  const p = isWin ? path.win32 : path.posix;
  const exts = isWin
    ? (opts.env?.PATHEXT ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const probe = (dir: string): boolean => {
    for (const ext of exts) {
      // On win32 an explicit extension (e.g. `codex.cmd`) must not be double-suffixed.
      if (ext && command.toLowerCase().endsWith(ext.toLowerCase())) {
        if (exists(dir ? p.join(dir, command) : command)) return true;
        continue;
      }
      if (exists(dir ? p.join(dir, `${command}${ext}`) : `${command}${ext}`)) return true;
    }
    return false;
  };
  // A command that already carries a path separator is a literal path, not a bare name.
  if (command.includes('/') || (isWin && command.includes('\\'))) {
    return probe('');
  }
  const env = opts.env ?? process.env;
  const pathVar = env.PATH ?? env.Path ?? '';
  if (!pathVar.trim()) return false;
  for (const dir of pathVar.split(p.delimiter)) {
    if (!dir) continue;
    if (probe(dir)) return true;
  }
  return false;
}

/**
 * True when a `claude` executable is resolvable on PATH. Thin wrapper over
 * {@link isCliAvailable} (kept as the named entry point the eval tools use).
 */
export function isClaudeCliAvailable(opts: ClaudeCliDetectOpts = {}): boolean {
  return isCliAvailable('claude', opts);
}

/**
 * A config-declared bare subscription CLI for a non-Claude agent (#1710). `vendor`
 * selects a built-in arg dialect (`codex`/`gemini`) or `custom`; `command` is the
 * binary detected on PATH. No API key — the CLI authenticates itself. Mirrors the
 * JSON-config shape of `comprehension.analysisCli`.
 */
export interface AnalysisCliConfig {
  vendor: 'codex' | 'gemini' | 'custom';
  command: string;
  model?: string | undefined;
  custom?: { args: string[]; promptVia?: 'arg' | 'stdin'; parse?: 'text' | 'json' } | undefined;
}

type CreateCliProvider = (opts: {
  vendor: 'codex' | 'gemini' | 'custom';
  command: string;
  defaultModel?: string;
  custom?: { args: string[]; promptVia?: 'arg' | 'stdin'; parse?: 'text' | 'json' };
}) => unknown;

/**
 * Generic subscription-CLI provider (#1710) when a `comprehension.analysisCli`
 * block is configured AND its `command` is on PATH, else null. Inserted in
 * precedence BEFORE the Claude CLI so a configured codex/gemini CLI wins over an
 * incidental `claude` on PATH — provider-neutral, never forcing a Claude flag onto
 * another vendor. `model` overrides the config model when provided.
 */
function makeGenericCliProvider(
  intelligence: Intelligence,
  model: string | undefined,
  cli: AnalysisCliConfig | undefined,
  available: boolean
): unknown {
  if (!cli || !cli.command || !available) return null;
  const create = intelligence.createCliAnalysisProvider as CreateCliProvider | undefined;
  if (typeof create !== 'function') return null;
  const resolvedModel = model ?? cli.model;
  return create({
    vendor: cli.vendor,
    command: cli.command,
    ...(resolvedModel ? { defaultModel: resolvedModel } : {}),
    ...(cli.custom ? { custom: cli.custom } : {}),
  });
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
export type ProviderKind = 'anthropic' | 'local' | 'generic-cli' | 'claude-cli' | null;

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
    /** PATH probe for the configured generic CLI (defaults to a real `isCliAvailable`). */
    isGenericCliAvailable?: (command: string) => boolean;
    env?: NodeJS.ProcessEnv;
    endpoint?: AnalysisEndpoint;
    /** A config-declared bare subscription CLI (#1710); wins over claude-CLI. */
    cli?: AnalysisCliConfig;
  } = {}
): ProviderKind {
  const env = opts.env ?? process.env;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  // A config-declared endpoint counts as `local` even when the env is unset.
  if (opts.endpoint?.baseUrl?.trim() || env.HARNESS_ANALYSIS_BASE_URL?.trim()) return 'local';
  // A configured generic subscription CLI, present on PATH, is inserted BEFORE
  // claude-CLI so a codex/gemini install is preferred over an incidental `claude`.
  if (opts.cli?.command) {
    const genericAvailable = (opts.isGenericCliAvailable ?? ((c: string) => isCliAvailable(c)))(
      opts.cli.command
    );
    if (genericAvailable) return 'generic-cli';
  }
  const claudeAvailable = (opts.isClaudeCliAvailable ?? (() => isClaudeCliAvailable()))();
  return claudeAvailable ? 'claude-cli' : null;
}

export async function resolveAnalysisProvider(
  model?: string,
  opts: {
    isClaudeCliAvailable?: () => boolean;
    /** PATH probe for the configured generic CLI (defaults to a real `isCliAvailable`). */
    isGenericCliAvailable?: (command: string) => boolean;
    endpoint?: AnalysisEndpoint;
    /** A config-declared bare subscription CLI (#1710); inserted before claude-CLI. */
    cli?: AnalysisCliConfig;
  } = {}
): Promise<unknown> {
  try {
    const intelligence = (await import('@harness-engineering/intelligence')) as Intelligence;
    const claudeAvailable = (opts.isClaudeCliAvailable ?? (() => isClaudeCliAvailable()))();
    const genericAvailable = opts.cli?.command
      ? (opts.isGenericCliAvailable ?? ((c: string) => isCliAvailable(c)))(opts.cli.command)
      : false;
    return (
      makeAnthropicProvider(intelligence, model) ??
      makeLocalProvider(intelligence, model, opts.endpoint) ??
      makeGenericCliProvider(intelligence, model, opts.cli, genericAvailable) ??
      makeClaudeCliProvider(intelligence, model, claudeAvailable)
    );
  } catch {
    return null;
  }
}
