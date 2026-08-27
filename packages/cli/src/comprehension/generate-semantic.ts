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
//   - Per-run budget: enforced from the RETURNED tokenUsage; fail-loud when
//     exhausted (remaining modules left semantic:absent, never silently partial).
//   - Reentrancy guard: HARNESS_COMPREHENSION_ACTIVE is set before analyze (so the
//     inherited-env nested `claude` child sees it) and restored in finally; if it
//     is already set on entry, the adapter refuses to recurse.

import { z } from 'zod';
import type {
  SourceFile,
  SemanticInput,
  SemanticGeneration,
  GenerateSemantic,
} from '@harness-engineering/core';
import type { AnalysisProvider } from '@harness-engineering/intelligence';

/** Authority-in-TS: the unit shape is validated here, never trusted raw. */
export const semanticResponseSchema = z
  .object({ summary: z.string(), invariants: z.array(z.string()) })
  .strict();
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

const TRUNCATION_MARKER = '\n… [source truncated for comprehension digest]';

/**
 * Bounded source digest — input tokens bounded by `budget`, not module size.
 * Joins `// path\ncontent` blocks; when adding a block would exceed the budget,
 * the accumulated output (plus the offending block) is hard-capped to the budget
 * (leaving room for the marker) and the truncation marker is appended.
 */
export function boundSourceDigest(
  files: SourceFile[],
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
  sourceFiles: SourceFile[];
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
 * and a cheap-tier default model. A reentrancy guard sets
 * `HARNESS_COMPREHENSION_ACTIVE` for the duration of the (inherited-env) child
 * subprocess and refuses to recurse if it is already set on entry.
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

  return async (input: SemanticInput): Promise<SemanticGeneration | null> => {
    // Reentrancy guard: a comprehend-triggered nested `claude` must not recurse.
    if (process.env[REENTRANCY_ENV]) return null;

    if (spent >= budget) {
      if (!budgetWarned) {
        log.warn(
          `comprehension: per-run token budget (${budget}) exhausted; remaining modules left semantic:absent`
        );
        budgetWarned = true;
      }
      return null;
    }

    const prev = process.env[REENTRANCY_ENV];
    process.env[REENTRANCY_ENV] = '1';
    try {
      const res = await provider.analyze<unknown>({
        prompt: buildSemanticPrompt(input, opts.digestCharBudget),
        responseSchema: semanticResponseSchema,
        disableThinking: true,
        maxTokens: maxOutputTokens,
        model,
      });
      // Charge the budget from the RETURNED usage (fail-loud on the NEXT call).
      spent += res.tokenUsage?.totalTokens ?? 0;

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
    } finally {
      if (prev === undefined) delete process.env[REENTRANCY_ENV];
      else process.env[REENTRANCY_ENV] = prev;
    }
  };
}
