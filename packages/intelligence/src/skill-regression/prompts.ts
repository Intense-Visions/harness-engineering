import { z } from 'zod';
import type { RubricCriterion } from './types.js';

/**
 * Zod schema for the LLM judge response: one ruling per rubric criterion plus
 * an overall confidence.
 *
 * `authority` and the numeric `score` are intentionally ABSENT: the score is
 * computed in TypeScript from the weighted rubric rulings (see `./scorer.js`)
 * and authority is derived from (verdict, confidence) — neither is ever supplied
 * by the model. The schema is `.strict()` so an injected extra key (e.g.
 * `authority` or `score`) is rejected at the parse boundary. Mirrors the
 * outcome-eval seam.
 */
export const criterionJudgmentSchema = z
  .object({
    id: z.string().describe('The rubric criterion id being ruled on'),
    met: z.boolean().describe('Whether the candidate output meets this criterion'),
    note: z.string().describe('Short justification citing the output; no secrets'),
  })
  .strict();

export const judgeResponseSchema = z
  .object({
    criteria: z
      .array(criterionJudgmentSchema)
      .describe('One ruling per rubric criterion, in the rubric order'),
    confidence: z
      .enum(['low', 'medium', 'high'])
      .describe('Confidence in the rulings; high requires an unambiguous output'),
  })
  .strict();

export type JudgeResponse = z.infer<typeof judgeResponseSchema>;

/**
 * System prompt for the skill-regression judge. Conservative-confidence posture
 * copied from outcome-eval / security-craft: default to `medium`; `high` only
 * when the output is unambiguous against the rubric. The judge scores QUALITY
 * against a rubric — it does not compare against a reference verbatim, so a
 * differently-worded but equally-good output is not penalized.
 */
export const SKILL_REGRESSION_SYSTEM_PROMPT = `You are a skill-output quality judge. Given the input a skill was run on, a quality rubric, and a candidate output the skill produced, rule for EACH rubric criterion whether the candidate output meets it.

Judge SEMANTIC quality against the rubric, not surface similarity to any reference. A differently-worded output that satisfies the criterion is "met"; a fluent output that misses the criterion's substance is "not met".

Confidence calibration (be conservative — false alarms block skill PRs):
- Default to "medium" confidence.
- Use "high" ONLY when the candidate output is unambiguous against the rubric.
- Use "low" when the output is truncated, ambiguous, or off-topic.
- When unsure between two confidence levels, choose the lower one.

Rules:
- Return exactly one ruling per rubric criterion, echoing its "id".
- Each "note" briefly cites the output; never include secrets or stack traces.
- Do NOT emit a numeric score or an "authority" field. Both are computed downstream in TypeScript and must never come from you.

Return your rulings using the structured_output tool.`;

/** Per-field character cap for the candidate output block. */
export const PROMPT_FIELD_MAX_CHARS = 12_000;

/** Outer fence uses 4 backticks so an inner ``` cannot close it early. */
const FENCE = '````';

/** Clamp a free-text body, appending a marker noting how many chars were dropped. */
function clampField(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PROMPT_FIELD_MAX_CHARS) return trimmed;
  const dropped = trimmed.length - PROMPT_FIELD_MAX_CHARS;
  return `${trimmed.slice(0, PROMPT_FIELD_MAX_CHARS)}\n… [truncated ${dropped} chars]`;
}

/** Render the rubric as a numbered list the judge rules against. */
function renderRubric(rubric: RubricCriterion[]): string {
  return rubric.map((c, i) => `${i + 1}. [id: ${c.id}] ${c.criterion.trim()}`).join('\n');
}

/**
 * Build the user prompt from the skill input, the rubric, and one candidate
 * output. The candidate is clamped and wrapped in a 4-backtick fence so a
 * triple-backtick sequence inside it cannot close the fence early.
 */
export function buildUserPrompt(
  skill: string,
  input: string,
  rubric: RubricCriterion[],
  candidate: string
): string {
  return [
    `## Skill under test`,
    skill,
    '',
    '## Skill input',
    `${FENCE}`,
    clampField(input) || '(empty input)',
    FENCE,
    '',
    '## Quality rubric (rule each criterion met / not met)',
    renderRubric(rubric),
    '',
    '## Candidate output (produced by the skill)',
    `${FENCE}`,
    clampField(candidate) || '(empty output)',
    FENCE,
    '',
    '## Instructions',
    'Rule each rubric criterion for the candidate output. Echo each criterion id. Calibrate confidence conservatively per your system instructions.',
  ].join('\n');
}
