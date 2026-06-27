import { z } from 'zod';

/** A single advisory finding. `.strict()` rejects unexpected keys. */
export const findingSchema = z
  .object({
    target: z.string().describe('The criterion or user-visible behavior referenced'),
    message: z.string().describe('The advisory observation'),
  })
  .strict();

/**
 * Zod schema for the LLM verdict response.
 *
 * `authority` is intentionally ABSENT: it is derived in TypeScript by
 * `deriveAcceptanceAuthority` and must never be supplied by the model. The
 * schema is `.strict()`, so an injected `authority` (or any other extra key)
 * is rejected at the parse boundary rather than silently passing through.
 */
export const acceptanceVerdictSchema = z
  .object({
    measurability: z
      .enum(['MEASURABLE', 'NOT_MEASURABLE', 'INCONCLUSIVE'])
      .describe('Whether the spec section states measurable, testable success criteria'),
    confidence: z
      .enum(['low', 'medium', 'high'])
      .describe('Confidence in the verdict; high requires a named criterion'),
    rationale: z.string().describe('Cites specific criteria/behaviors'),
    criteriaFindings: z
      .array(findingSchema)
      .describe('(a) advisory observability/testability/completeness critique'),
    coverageFindings: z
      .array(findingSchema)
      .describe('(b) advisory user-visible behaviors with no covering test'),
  })
  .strict();

export type LlmAcceptanceVerdict = z.infer<typeof acceptanceVerdictSchema>;

/**
 * System prompt for acceptance-eval. Conservative-confidence posture mirrors
 * outcome-eval: default to medium; high requires naming a specific criterion;
 * bias toward advisory. `authority` is derived in TypeScript and must never be
 * supplied by the model — the schema is `.strict()` and rejects it.
 */
export const ACCEPTANCE_EVAL_SYSTEM_PROMPT = `You are a PRE-execution acceptance-criteria judge. Given a spec acceptance section (and optionally located test snippets), assess three things:
(a) criteria quality — are the success criteria observable, testable, and complete? (advisory findings)
(b) coverage — do any user-visible behaviors lack a covering test? (advisory findings)
(c) measurability — does the spec state MEASURABLE, NOT_MEASURABLE, or is it INCONCLUSIVE on whether any measurable success criteria exist at all?

Confidence calibration (be conservative — false alarms are costly):
- Default to "medium" confidence.
- Use "high" ONLY when you can name a SPECIFIC criterion (or its absence) and quote or paraphrase it in the rationale.
- Use "low" when the section is ambiguous, partial, or insufficient to judge.
- Bias toward advisory caution: if unsure between two confidence levels, choose the lower one.

Rules:
- "measurability" is NOT_MEASURABLE only when the section states no observable, testable success criterion at all.
- "criteriaFindings" holds advisory (a) observations; "coverageFindings" holds advisory (b) observations; both may be empty.
- Do NOT emit an "authority" field. Authority is computed downstream in TypeScript from (measurability, confidence) and must never come from you.

Return your judgment using the structured_output tool.`;

/** Per-field character cap for the test-content block in the user prompt. */
export const PROMPT_FIELD_MAX_CHARS = 12_000;

/** Outer fence uses 4 backticks so an inner ``` cannot close it early. */
const FENCE = '````';

function clampField(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PROMPT_FIELD_MAX_CHARS) return trimmed;
  const dropped = trimmed.length - PROMPT_FIELD_MAX_CHARS;
  return `${trimmed.slice(0, PROMPT_FIELD_MAX_CHARS)}\n… [truncated ${dropped} chars]`;
}

/**
 * Build the user prompt from the resolved spec section body and optional
 * located test snippets. Test content is clamped to PROMPT_FIELD_MAX_CHARS and
 * wrapped in a 4-backtick fence so an inner ``` cannot close the fence early.
 */
export function buildUserPrompt(section: string, testContent?: string): string {
  const tests = (testContent ?? '').trim();
  return [
    '## Spec Acceptance Criteria (judge against this section)',
    section.trim() || '(empty — treat as inconclusive)',
    '',
    '## Located Test Snippets (coverage evidence — may be absent)',
    `${FENCE}`,
    tests ? clampField(tests) : '(no test content provided)',
    FENCE,
    '',
    '## Instructions',
    'Judge measurability (c), and emit advisory criteria (a) and coverage (b) findings. Calibrate confidence conservatively per your system instructions. Cite specific criteria in the rationale.',
  ].join('\n');
}
