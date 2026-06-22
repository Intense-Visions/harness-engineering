import { z } from 'zod';

/**
 * Zod schema for the LLM verdict response.
 *
 * `authority` is intentionally ABSENT: it is derived in TypeScript by
 * `deriveAuthority` and must never be supplied by the model. The schema is
 * `.strict()` so an injected `authority` (or any other extra key) is rejected
 * at the parse boundary rather than silently passing through.
 *
 */
export const verdictSchema = z
  .object({
    verdict: z
      .enum(['SATISFIED', 'NOT_SATISFIED', 'INCONCLUSIVE'])
      .describe('Whether the change satisfies the judged spec section'),
    confidence: z
      .enum(['low', 'medium', 'high'])
      .describe('Confidence in the verdict; high requires a named criterion'),
    rationale: z.string().describe('Cites specific met / unmet criteria'),
    unmetCriteria: z.array(z.string()).describe('Unmet criteria; empty when SATISFIED'),
  })
  .strict();

export type LlmVerdict = z.infer<typeof verdictSchema>;

/**
 * System prompt for outcome-eval. Conservative-confidence posture copied from
 * security-craft (SKILL.md): the model defaults to `medium` confidence; `high`
 * requires naming a specific met or unmet criterion; the bias is toward
 * advisory, not blocking. `authority` is derived in TypeScript and must never
 * be supplied by the model — the schema is `.strict()` and rejects it.
 */
export const OUTCOME_EVAL_SYSTEM_PROMPT = `You are a post-execution outcome judge. Given a spec acceptance section, a unified diff, and test output, decide whether the change SATISFIED, NOT_SATISFIED, or is INCONCLUSIVE against that section.

Confidence calibration (be conservative — false alarms are costly):
- Default to "medium" confidence.
- Use "high" ONLY when you can name a SPECIFIC criterion from the section that the diff and test output clearly met or clearly failed to meet, and quote or paraphrase it in the rationale.
- Use "low" when the diff or test output is ambiguous, partial, or insufficient to judge.
- When the change only PARTIALLY meets the criteria, do not exceed "medium" confidence.
- Bias toward advisory caution: if unsure between two confidence levels, choose the lower one.

Rules:
- The rationale MUST cite specific met or unmet criteria from the section.
- "unmetCriteria" lists the section criteria the change failed to meet; it is empty when the verdict is SATISFIED.
- Do NOT emit an "authority" field. Authority is computed downstream in TypeScript from (verdict, confidence) and must never come from you.

Return your judgment using the structured_output tool.`;

/**
 * Build the user prompt from the resolved spec section body, the change diff,
 * and the captured test output. Mirrors the labeled-section structure of
 * sel/pesl prompts.
 */
export function buildUserPrompt(section: string, diff: string, testOutput: string): string {
  return [
    '## Spec Acceptance Criteria (judge against this section)',
    section.trim() || '(empty — treat as inconclusive)',
    '',
    '## Change Diff',
    '```diff',
    diff.trim() || '(empty diff)',
    '```',
    '',
    '## Test Output',
    '```',
    testOutput.trim() || '(no test output captured)',
    '```',
    '',
    '## Instructions',
    'Judge whether the diff satisfies the acceptance criteria above. Calibrate confidence conservatively per your system instructions. Cite specific criteria in the rationale.',
  ].join('\n');
}
