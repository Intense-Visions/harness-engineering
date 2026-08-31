import { spawn } from 'node:child_process';
import type { AnalysisProvider, AnalysisRequest, AnalysisResponse } from './interface.js';
import { zodToJsonSchema } from './schema.js';
import {
  coerceStructuredContent,
  extractEmbeddedJson,
  buildCorrectionPrompt,
} from './structured-output.js';

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Context handed to a {@link GenericCliArgTemplate} for one CLI invocation. A
 * template turns this into the concrete argv (and optional stdin) for the vendor
 * CLI, since every subscription CLI passes the prompt / schema / model
 * differently (positional arg vs `-p`, no `--json-schema` flag at all, etc.).
 */
export interface GenericCliArgContext {
  /** The full prompt to send (system + user already joined by the provider). */
  prompt: string;
  /** The JSON schema object (already `{ type: 'object', … }`-wrapped). */
  schema: object;
  /** `JSON.stringify(schema)` — convenience for templates that fold it into the prompt. */
  schemaJson: string;
  /** Model name to request, or undefined to let the CLI decide. */
  model?: string | undefined;
}

/** The concrete invocation a template produces: argv plus optional stdin payload. */
export interface GenericCliInvocation {
  /** Arguments passed to the vendor CLI (the command itself is separate). */
  args: string[];
  /** Optional payload written to the child's stdin (e.g. the prompt for stdin-fed CLIs). */
  stdin?: string | undefined;
}

/**
 * Builds the vendor-specific argv (+ optional stdin) for one call. This is the
 * "arg dialect" plug — codex/gemini/custom each supply their own.
 */
export type GenericCliArgTemplate = (ctx: GenericCliArgContext) => GenericCliInvocation;

/** Structured result a {@link GenericCliOutputParser} recovers from raw stdout. */
export interface GenericCliParseResult {
  /**
   * The schema-candidate content. MUST be returned raw (e.g. the prose string)
   * rather than thrown on a chatty reply, so the provider's mechanical schema
   * check fails cleanly and fires ONE corrective retry — mirroring the Claude CLI
   * provider's recovery loop.
   */
  content: unknown;
  /** Token usage, when the vendor CLI reports it (many bare CLIs do not). */
  usage?: { input_tokens: number; output_tokens: number } | undefined;
  /** Model name echoed by the CLI, when present. */
  model?: string | undefined;
}

/**
 * Maps a vendor CLI's raw stdout to a {@link GenericCliParseResult}. It may throw
 * on a genuinely unusable output (non-JSON when JSON was contractually required),
 * which the provider surfaces as a real failure; for a merely schema-mismatching
 * reply it should return the raw content so the corrective retry can run.
 */
export type GenericCliOutputParser = (stdout: string) => GenericCliParseResult;

export interface GenericCliProviderOptions {
  /** Path to (or name of) the vendor CLI binary — REQUIRED (no Claude default). */
  command: string;
  /** How the prompt / schema / model are passed to the CLI. REQUIRED. */
  argTemplate: GenericCliArgTemplate;
  /** How the CLI's stdout maps to structured content (default: {@link textSalvageParser}). */
  outputParser?: GenericCliOutputParser | undefined;
  /** Default model requested when the call does not name one. */
  defaultModel?: string | undefined;
  /** Request timeout in ms (default: 180000). */
  timeoutMs?: number | undefined;
  /**
   * Label reported as `response.model` when neither the request, the parser, nor
   * `defaultModel` names a model. Defaults to `command`.
   */
  modelLabel?: string | undefined;
}

/**
 * A provider-neutral {@link AnalysisProvider} for a **bare subscription CLI** — a
 * non-Claude agent CLI (codex-CLI, gemini-CLI, …) that authenticates through its
 * own subscription and exposes no API key and no OpenAI-compatible `/v1`
 * endpoint. It is the CLI sibling of {@link OpenAICompatibleAnalysisProvider}
 * (gateway) and {@link ClaudeCliAnalysisProvider} (Claude-specific flags).
 *
 * Unlike the Claude CLI provider, NOTHING here is Claude-specific: the argv
 * dialect ({@link GenericCliArgTemplate}) and the stdout parse
 * ({@link GenericCliOutputParser}) are both injected, so one implementation
 * covers every vendor. Bare CLIs generally have no `--json-schema` equivalent, so
 * the built-in templates fold the schema instruction into the prompt and the
 * default parser SALVAGES the embedded JSON object from the CLI's prose. The same
 * mechanical "schema check → one corrective retry" recovery as the Claude CLI
 * provider applies.
 *
 * Vision is unsupported (bare CLIs vary wildly); `request.images` is ignored and
 * the text prompt answers alone, exactly like the OpenAI-compatible provider.
 */
export class GenericCliAnalysisProvider implements AnalysisProvider {
  private readonly command: string;
  private readonly argTemplate: GenericCliArgTemplate;
  private readonly outputParser: GenericCliOutputParser;
  private readonly defaultModel: string | undefined;
  private readonly timeoutMs: number;
  private readonly modelLabel: string;

  constructor(options: GenericCliProviderOptions) {
    if (!options.command) {
      throw new Error('GenericCliAnalysisProvider requires a `command` (the vendor CLI binary).');
    }
    if (typeof options.argTemplate !== 'function') {
      throw new Error('GenericCliAnalysisProvider requires an `argTemplate` function.');
    }
    this.command = options.command;
    this.argTemplate = options.argTemplate;
    this.outputParser = options.outputParser ?? textSalvageParser;
    this.defaultModel = options.defaultModel;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.modelLabel = options.modelLabel ?? options.command;
  }

  async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
    const model = request.model ?? this.defaultModel;
    const jsonSchema = zodToJsonSchema(request.responseSchema);
    const schema = { type: 'object', ...jsonSchema };
    const schemaJson = JSON.stringify(schema);

    const basePrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.prompt}`
      : request.prompt;

    const startMs = performance.now();

    // Usage accrues across attempts so the corrective retry's cost is charged too.
    let inputTokens = 0;
    let outputTokens = 0;
    let lastModel: string | undefined;

    const runOnce = async (prompt: string): Promise<unknown> => {
      const raw = await this.runCli(prompt, schema, schemaJson, model);
      inputTokens += raw.usage?.input_tokens ?? 0;
      outputTokens += raw.usage?.output_tokens ?? 0;
      lastModel = raw.model;
      return raw.content;
    };

    // Attempt 1. A THROWN runCli (genuine spawn / non-zero exit / contractual
    // parse failure) propagates as a real failure. A merely schema-mismatching
    // reply — the CLI narrated instead of emitting the object — is the recoverable
    // case: the mechanical schema check below fails and we fire ONE corrective retry.
    let content = await runOnce(basePrompt);
    let parsed = request.responseSchema.safeParse(content);

    if (!parsed.success) {
      const badOutput = typeof content === 'string' ? content : JSON.stringify(content);
      content = await runOnce(buildCorrectionPrompt(basePrompt, badOutput, schemaJson));
      parsed = request.responseSchema.safeParse(content);
      if (!parsed.success) {
        throw new Error(
          `${this.command} CLI output did not match the required schema after one corrective retry: ${parsed.error.message}`
        );
      }
    }

    const latencyMs = Math.round(performance.now() - startMs);

    return {
      result: parsed.data as T,
      tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      model: lastModel ?? model ?? this.modelLabel,
      latencyMs,
    };
  }

  private runCli(
    prompt: string,
    schema: object,
    schemaJson: string,
    model: string | undefined
  ): Promise<GenericCliParseResult> {
    const invocation = this.argTemplate({ prompt, schema, schemaJson, model });
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, invocation.args, {
        env: process.env,
        timeout: this.timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`${this.command} CLI failed to spawn: ${err.message}`));
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `${this.command} CLI exited with code ${code}: ${stderr.trim() || stdout.trim()}`
            )
          );
          return;
        }
        try {
          resolve(this.outputParser(stdout));
        } catch (err) {
          const stdoutSnippet = stdout.slice(0, 500);
          const stderrSnippet = stderr.slice(0, 500);
          reject(
            new Error(
              `Failed to parse ${this.command} CLI output: ${
                err instanceof Error ? err.message : String(err)
              }. stdout (first 500 chars): ${JSON.stringify(stdoutSnippet)}. ` +
                `stderr (first 500 chars): ${JSON.stringify(stderrSnippet)}`
            )
          );
        }
      });

      if (invocation.stdin !== undefined) {
        child.stdin.write(invocation.stdin);
      }
      child.stdin.end();
    });
  }
}

// ---------------------------------------------------------------------------
// Built-in output parsers
// ---------------------------------------------------------------------------

/**
 * Salvage a JSON object embedded in a CLI's prose stdout. This is the honest
 * default for a bare subscription CLI that has no structured-output flag and just
 * prints text: prefer a whole-stdout JSON parse, else scan for the first balanced
 * `{ … }` that parses. When nothing parses, return the raw stdout as `content` so
 * the provider's schema check fails and fires one corrective retry (NEVER throws).
 */
export function textSalvageParser(stdout: string): GenericCliParseResult {
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      return { content: JSON.parse(trimmed) };
    } catch {
      /* not pure JSON — fall through to embedded-object salvage */
    }
    const salvaged = extractEmbeddedJson(trimmed);
    if (salvaged !== undefined) return { content: salvaged };
  }
  return { content: stdout };
}

/**
 * Parse a whole-stdout JSON envelope (a CLI that DOES emit a single JSON object),
 * reusing {@link coerceStructuredContent} to prefer a `structured_output` /
 * JSON-or-prose `result` field and to surface `usage` / `model`. Throws on
 * non-JSON stdout, which the provider treats as a real (non-recoverable) failure —
 * use this only for a CLI contractually committed to JSON output.
 */
export function jsonEnvelopeParser(stdout: string): GenericCliParseResult {
  const parsed = JSON.parse(stdout) as Record<string, unknown>;
  const usage = parsed.usage as { input_tokens: number; output_tokens: number } | undefined;
  return {
    content: coerceStructuredContent(parsed),
    ...(usage ? { usage } : {}),
    ...(typeof parsed.model === 'string' ? { model: parsed.model } : {}),
  };
}

// ---------------------------------------------------------------------------
// Vendor presets + custom template factory
// ---------------------------------------------------------------------------

/** Built-in vendor dialects the config can select by name. */
export type CliVendor = 'codex' | 'gemini';

/**
 * Fold a "reply with ONLY this JSON object" instruction into the prompt. Bare
 * subscription CLIs have no `--json-schema` equivalent, so structured output is
 * requested in-band and recovered by {@link textSalvageParser}.
 */
function withSchemaInstruction(prompt: string, schemaJson: string): string {
  return (
    `${prompt}\n\n` +
    `Reply with ONLY a single JSON object conforming to this JSON schema — no prose, ` +
    `no explanation, no markdown code fences:\n${schemaJson}`
  );
}

/**
 * codex-CLI dialect (best-effort, ASSUMED — see #1710 "Verification limits": not
 * exercised against a real codex CLI). Runs the non-interactive `codex exec`
 * subcommand with the schema-augmented prompt as a positional argument and `-m`
 * for the model. Output is parsed with {@link textSalvageParser}. Override any of
 * this with the `custom` vendor once the real dialect is confirmed.
 */
export const codexCliTemplate: GenericCliArgTemplate = ({ prompt, schemaJson, model }) => {
  const args = ['exec'];
  if (model) args.push('-m', model);
  args.push(withSchemaInstruction(prompt, schemaJson));
  return { args };
};

/**
 * gemini-CLI dialect (best-effort, ASSUMED — see #1710 "Verification limits": not
 * exercised against a real gemini CLI). Runs non-interactively with `-p` carrying
 * the schema-augmented prompt and `-m` for the model. Output is parsed with
 * {@link textSalvageParser}. Override with the `custom` vendor once confirmed.
 */
export const geminiCliTemplate: GenericCliArgTemplate = ({ prompt, schemaJson, model }) => {
  const args = ['-p', withSchemaInstruction(prompt, schemaJson)];
  if (model) args.push('-m', model);
  return { args };
};

/** Placeholder tokens a custom arg template may reference. */
const PROMPT_TOKEN = '{{prompt}}';
const SCHEMA_TOKEN = '{{schema}}';
const MODEL_TOKEN = '{{model}}';

export interface CustomCliTemplateOptions {
  /**
   * argv tokens for the CLI. Any token equal to (or containing) `{{prompt}}`,
   * `{{schema}}`, or `{{model}}` is substituted per call; a bare `{{model}}` token
   * is DROPPED when no model is set (so an empty flag value is never passed).
   */
  args: string[];
  /**
   * Where the prompt goes: `arg` substitutes `{{prompt}}` in argv (default);
   * `stdin` writes the schema-augmented prompt to the child's stdin instead (and
   * still substitutes `{{prompt}}` if present in argv).
   */
  promptVia?: 'arg' | 'stdin';
  /** Whether the schema instruction is folded into the prompt (default: true). */
  foldSchemaIntoPrompt?: boolean;
}

/**
 * Build a fully-configurable arg template from JSON-declarable options (no code),
 * so an adopter whose CLI does not match a built-in preset can wire it via config.
 * `{{prompt}}`/`{{schema}}`/`{{model}}` placeholders in `args` are substituted per
 * call.
 */
export function buildCustomCliTemplate(options: CustomCliTemplateOptions): GenericCliArgTemplate {
  const promptVia = options.promptVia ?? 'arg';
  const foldSchema = options.foldSchemaIntoPrompt ?? true;
  return ({ prompt, schemaJson, model }) => {
    const effectivePrompt = foldSchema ? withSchemaInstruction(prompt, schemaJson) : prompt;
    const args: string[] = [];
    for (const token of options.args) {
      if (token === MODEL_TOKEN && !model) continue; // drop a bare model flag when unset
      const substituted = token
        .replaceAll(PROMPT_TOKEN, promptVia === 'arg' ? effectivePrompt : prompt)
        .replaceAll(SCHEMA_TOKEN, schemaJson)
        .replaceAll(MODEL_TOKEN, model ?? '');
      args.push(substituted);
    }
    return promptVia === 'stdin' ? { args, stdin: effectivePrompt } : { args };
  };
}

export interface CreateCliAnalysisProviderOptions {
  /** `codex`/`gemini` selects a built-in dialect; `custom` uses `custom` below. */
  vendor: CliVendor | 'custom';
  /** The vendor CLI binary (name or path). REQUIRED. */
  command: string;
  /** Default model requested when the call does not name one. */
  defaultModel?: string | undefined;
  /** Request timeout in ms. */
  timeoutMs?: number | undefined;
  /** Custom dialect (REQUIRED when `vendor === 'custom'`). */
  custom?: (CustomCliTemplateOptions & { parse?: 'text' | 'json' }) | undefined;
}

/**
 * Construct a {@link GenericCliAnalysisProvider} from JSON-config-friendly options
 * — the seam the CLI resolver uses to turn a `comprehension.analysisCli` config
 * block into a live provider without embedding functions in config. `codex` and
 * `gemini` pick a built-in template + {@link textSalvageParser}; `custom` builds a
 * template from placeholders and selects the text (salvage) or json (envelope)
 * parser.
 */
export function createCliAnalysisProvider(
  options: CreateCliAnalysisProviderOptions
): GenericCliAnalysisProvider {
  const base = {
    command: options.command,
    ...(options.defaultModel !== undefined && { defaultModel: options.defaultModel }),
    ...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
  };
  if (options.vendor === 'codex') {
    return new GenericCliAnalysisProvider({ ...base, argTemplate: codexCliTemplate });
  }
  if (options.vendor === 'gemini') {
    return new GenericCliAnalysisProvider({ ...base, argTemplate: geminiCliTemplate });
  }
  // custom
  if (!options.custom) {
    throw new Error(
      "createCliAnalysisProvider: vendor 'custom' requires a `custom` template spec."
    );
  }
  const { parse, ...templateOpts } = options.custom;
  return new GenericCliAnalysisProvider({
    ...base,
    argTemplate: buildCustomCliTemplate(templateOpts),
    outputParser: parse === 'json' ? jsonEnvelopeParser : textSalvageParser,
  });
}
