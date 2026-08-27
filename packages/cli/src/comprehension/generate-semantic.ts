// packages/cli/src/comprehension/generate-semantic.ts
//
// The cli-side `GenerateSemantic` adapter (phase 3 of compiled-comprehension-
// substrate). It satisfies the core compiler seam
// (`GenerateSemantic = (SemanticInput) => SemanticGeneration | null`) backed by an
// `AnalysisProvider.analyze<T>()` resolved by the MCP-side resolver (D8:
// Anthropic key → local `/v1` → claude-CLI → null). It lives in the cli package
// (not core) because it needs `@harness-engineering/intelligence` and the
// resolver, which are cli/MCP concerns; core stays IO/provider-injected and pure.
//
// Design levers (Observable Truths 4–8):
//   - Authority-in-TS: the provider's raw output is re-validated against a Zod
//     `responseSchema` at THIS seam; a malformed shape → null + a loud log (never
//     a malformed unit, never an unhandled throw that aborts the run).
//   - Input bounding: the prompt is built from the static interfaceContract +
//     dependencySlice + a BOUNDED source digest — input tokens are bounded by the
//     public surface + a budget, not module size.
//   - Cost levers: each analyze() requests disableThinking + a tight maxTokens;
//     the model is overridable (defaults to the provider's own default — a cheap
//     tier; config wiring is phase 4).
//   - Per-run budget: enforced from the RETURNED tokenUsage; when a provider
//     omits usage, a pessimistic floor (the request maxTokens) is charged so the
//     budget still converges (fail-loud when exhausted — remaining modules left
//     semantic:absent, never silently partial).
//   - Reentrancy guard (RUN-boundary, not per-call): the Phase-4 driver wraps the
//     WHOLE comprehension run in `withComprehensionActive`, which sets
//     HARNESS_COMPREHENSION_ACTIVE for the run's duration. Any nested `claude`
//     child spawned during a module's analyze inherits the flag, so on its own
//     entry `isComprehensionReentrant()` is true and it refuses to recurse. The
//     per-module seam NEVER sets/clears/checks the flag — so in-process concurrent
//     siblings (Phase-4 `concurrency:4`) all proceed instead of silently degrading
//     to `semantic: absent`. Cross-process nesting and in-process concurrency are
//     distinct concerns; only the former is a recursion vector.

import { z } from 'zod';
// NB: the core barrel exports the graph-analysis `SourceFile` under the plain
// name and the comprehension `{ path, content }` source-file under the alias
// `ComprehensionSourceFile` (to avoid the name collision) — use the alias here.
import type {
  ComprehensionSourceFile,
  SemanticInput,
  SemanticGeneration,
  GenerateSemantic,
} from '@harness-engineering/core';
import type { AnalysisProvider } from '@harness-engineering/intelligence';

/**
 * Authority-in-TS: the unit shape is validated here, never trusted raw. Tolerant
 * of extra keys — real LLMs sprinkle stray fields, and a `.strict()` schema would
 * reject an otherwise-valid `{ summary, invariants }` and degrade the module to
 * `semantic: absent`. `.strip()` (Zod's default object behavior, made explicit)
 * ignores unknown keys while still enforcing `summary: string` +
 * `invariants: string[]`, keeping authority in TS.
 */
export const semanticResponseSchema = z
  .object({ summary: z.string(), invariants: z.array(z.string()) })
  .strip();
export type SemanticResult = z.infer<typeof semanticResponseSchema>;

/** Default character budget for the bounded source digest (input-bounding lever). */
export const DEFAULT_DIGEST_CHAR_BUDGET = 12_000;
/** Default tight output cap (cost lever) for the semantic call. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 700;
/**
 * Default model tier: a cheap/fast Haiku-class id (cost lever). Overridable per
 * call via {@link GenerateSemanticOptions.model}; phase-4 config
 * (`comprehension.model`) wires the real per-provider value. Deliberately a cheap
 * tier — comprehension summaries are a high-volume, low-stakes call, so we never
 * default to an expensive model.
 */
export const DEFAULT_SEMANTIC_MODEL = 'claude-3-5-haiku-latest';
/** Env flag marking an active comprehension pass (reentrancy guard). */
export const REENTRANCY_ENV = 'HARNESS_COMPREHENSION_ACTIVE';

/**
 * RUN-boundary reentrancy check. `true` when {@link REENTRANCY_ENV} is already set
 * on entry — i.e. this process was spawned (inheriting env) by an in-flight
 * comprehension run (the nested `claude --print` recursion vector). The Phase-4
 * driver calls this ONCE at the start of a run and refuses to comprehend when it
 * is true. It is NOT consulted per-module, so legitimate in-process concurrent
 * siblings are never blocked.
 */
export function isComprehensionReentrant(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[REENTRANCY_ENV]);
}

/**
 * Mark a whole comprehension run active for its entire duration. Sets
 * {@link REENTRANCY_ENV} before `fn`, restores the previous value in `finally`
 * (deleting it when it was previously unset), so any nested `claude` child spawned
 * by ANY module's analyze inherits the flag and, on its own entry,
 * {@link isComprehensionReentrant} returns true — the cross-process recursion
 * guard — while in-process concurrent siblings within this run all proceed.
 */
export async function withComprehensionActive<T>(
  fn: () => Promise<T>,
  env: NodeJS.ProcessEnv = process.env
): Promise<T> {
  const prev = env[REENTRANCY_ENV];
  env[REENTRANCY_ENV] = '1';
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete env[REENTRANCY_ENV];
    else env[REENTRANCY_ENV] = prev;
  }
}

const TRUNCATION_MARKER = '\n… [source truncated for comprehension digest]';

/**
 * Bounded source digest — input tokens bounded by `budget`, not module size.
 * Joins `// path\ncontent` blocks; when adding a block would exceed the budget,
 * the accumulated output (plus the offending block) is hard-capped to the budget
 * (leaving room for the marker) and the truncation marker is appended.
 */
export function boundSourceDigest(
  files: ComprehensionSourceFile[],
  budget = DEFAULT_DIGEST_CHAR_BUDGET
): string {
  let out = '';
  for (const f of files) {
    const block = `// ${f.path}\n${f.content}\n`;
    if (out.length + block.length > budget) {
      return (
        (out + block).slice(0, Math.max(0, budget - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER
      );
    }
    out += block;
  }
  return out;
}

/** Bounded input for the semantic prompt (mirrors core `SemanticInput`). */
export interface SemanticPromptInput {
  module: string;
  interfaceContract: string;
  dependencySlice: string;
  sourceFiles: ComprehensionSourceFile[];
}

/**
 * Build the semantic prompt from the STATIC contract + dependency slice + a
 * bounded source digest (static-feeds-semantic, D1). Input size is bounded by the
 * public surface and the digest budget, never by raw module size.
 */
export function buildSemanticPrompt(
  input: SemanticPromptInput,
  digestBudget = DEFAULT_DIGEST_CHAR_BUDGET
): string {
  return [
    `Summarize the module \`${input.module}\` for another engineer.`,
    `Return a concise prose summary and a list of load-bearing invariants.`,
    `## Interface Contract\n${input.interfaceContract}`,
    `## Dependency Slice\n${input.dependencySlice}`,
    `## Source (bounded digest)\n${boundSourceDigest(input.sourceFiles, digestBudget)}`,
  ].join('\n\n');
}

/** Loud channel for degradation warnings (defaults to `console`). */
interface Logger {
  warn: (message: string) => void;
}

export interface GenerateSemanticOptions {
  /** Model override; defaults to {@link DEFAULT_SEMANTIC_MODEL} (cheap tier). */
  model?: string;
  /** Tight per-call output cap (cost lever); defaults to {@link DEFAULT_MAX_OUTPUT_TOKENS}. */
  maxOutputTokens?: number;
  /** Per-run token budget enforced from the RETURNED tokenUsage; default Infinity. */
  maxTokensPerRun?: number;
  /** Input-bounding budget for the source digest; default {@link DEFAULT_DIGEST_CHAR_BUDGET}. */
  digestCharBudget?: number;
  /** Loud channel for budget/validation/failure warnings; defaults to console. */
  logger?: Logger;
}

/**
 * Build the concrete `GenerateSemantic` seam over an `AnalysisProvider`.
 *
 * The returned function is STATEFUL across module calls within one run: it shares
 * a token budget (enforced from the RETURNED `tokenUsage.totalTokens`) and a
 * once-only budget-exhausted warning. It NEVER throws for a merely-missing/failed
 * provider or a malformed response — it returns `null` so the compiler leaves the
 * unit `semantic: absent` (static-only), never partial, never malformed.
 *
 * Cost levers on every call: `disableThinking: true`, a tight `maxTokens`, a
 * bounded prompt (interface contract + dependency slice + bounded source digest),
 * and a cheap-tier default model. Reentrancy is guarded at the RUN boundary by the
 * driver (`withComprehensionActive` / `isComprehensionReentrant`), never at this
 * per-module seam — so concurrent siblings within a run all proceed.
 */
export function createGenerateSemantic(
  provider: AnalysisProvider,
  opts: GenerateSemanticOptions = {}
): GenerateSemantic {
  const maxOutputTokens = opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const budget = opts.maxTokensPerRun ?? Infinity;
  const model = opts.model ?? DEFAULT_SEMANTIC_MODEL;
  const log: Logger = opts.logger ?? console;
  let spent = 0;
  let budgetWarned = false;
  let usageMissingWarned = false;

  return async (input: SemanticInput): Promise<SemanticGeneration | null> => {
    // NB: the reentrancy guard is a RUN-boundary concern (withComprehensionActive /
    // isComprehensionReentrant), NOT a per-module one — this seam must never
    // set/clear/check REENTRANCY_ENV, so concurrent in-process siblings all proceed.
    if (spent >= budget) {
      if (!budgetWarned) {
        log.warn(
          `comprehension: per-run token budget (${budget}) exhausted; remaining modules left semantic:absent`
        );
        budgetWarned = true;
      }
      return null;
    }

    try {
      const res = await provider.analyze<unknown>({
        prompt: buildSemanticPrompt(input, opts.digestCharBudget),
        responseSchema: semanticResponseSchema,
        disableThinking: true,
        maxTokens: maxOutputTokens,
        model,
      });
      // Charge the budget from the RETURNED usage (fail-loud on the NEXT call).
      // When the provider omits usage (absent/zero), `spent += 0` would never
      // advance and maxTokensPerRun would be silently unenforceable — charge a
      // pessimistic floor (the request's maxTokens) so the budget still converges,
      // and warn ONCE that usage was missing.
      const reported = res.tokenUsage?.totalTokens ?? 0;
      if (reported > 0) {
        spent += reported;
      } else {
        if (!usageMissingWarned) {
          log.warn(
            `comprehension: provider returned no tokenUsage; charging a pessimistic floor of ${maxOutputTokens} tokens/call so the per-run budget still converges`
          );
          usageMissingWarned = true;
        }
        spent += maxOutputTokens;
      }

      // Authority-in-TS: re-validate the raw result at the seam.
      const parsed = semanticResponseSchema.safeParse(res.result);
      if (!parsed.success) {
        log.warn(
          `comprehension: semantic output for ${input.module} failed schema validation; left semantic:absent`
        );
        return null;
      }
      return {
        summary: parsed.data.summary,
        invariants: parsed.data.invariants,
        model: res.model ?? null,
      };
    } catch (err) {
      log.warn(
        `comprehension: semantic generation for ${input.module} failed (${
          err instanceof Error ? err.message : String(err)
        }); left semantic:absent`
      );
      return null;
    }
  };
}

/**
 * Graceful-degradation factory (SC4/SC5). Returns `undefined` when no provider
 * resolved (the D8 resolver returned `null`, e.g. no credential + no local
 * endpoint + no `claude`) so the caller simply OMITS `generateSemantic` from
 * `compileModule` → the unit is emitted static-only (`semantic: absent`), with
 * zero LLM calls and no credential. Otherwise it builds the concrete adapter.
 * Never throws for a missing provider.
 */
export function maybeCreateGenerateSemantic(
  provider: AnalysisProvider | null,
  opts: GenerateSemanticOptions = {}
): GenerateSemantic | undefined {
  return provider ? createGenerateSemantic(provider, opts) : undefined;
}
