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
import type { SourceFile } from '@harness-engineering/core';

/** Authority-in-TS: the unit shape is validated here, never trusted raw. */
export const semanticResponseSchema = z
  .object({ summary: z.string(), invariants: z.array(z.string()) })
  .strict();
export type SemanticResult = z.infer<typeof semanticResponseSchema>;

/** Default character budget for the bounded source digest (input-bounding lever). */
export const DEFAULT_DIGEST_CHAR_BUDGET = 12_000;
/** Default tight output cap (cost lever) for the semantic call. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 700;

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
