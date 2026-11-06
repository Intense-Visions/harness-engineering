/**
 * CRITIQUE phase — invokes the LLM provider per (unit, rubric) pair where the
 * rubric's appliesToKinds includes the unit's kind, and parses a 3-axis
 * finding from the response. Matches the fenced-JSON parser contract used
 * across the craft family (design-craft / naming-craft / docs-craft /
 * security-craft).
 *
 * The prompt carries the unit's OWN source span (not the whole file) so cost
 * scales with the unit under review, and a conservative-confidence system
 * prompt keeps judgment-based readability findings honest per ADR 0019.
 *
 * Source: docs/changes/code-craft/proposal.md (Technical Design → critique phase).
 */

import type { CloneClass, CloneMember } from '@harness-engineering/core';
import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { CodeRubric } from '../catalog/rubrics/index.js';
import type { CodeUnit, CodeFinding, Tier, Impact, Confidence } from '../findings/schema.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js';
import { unitSource } from '../extract/units.js';
import { renderSiblingEvidence } from './sibling-evidence.js';

const MAX_UNIT_CHARS = 2500;

/**
 * Rubrics whose text carries a clause only cross-file evidence can answer.
 *
 * CODE-R004 names the Rule of Three verbatim — "the same five lines copied in
 * three places crying out for one named home" — and was structurally unable to
 * answer it. The other six seed rubrics judge the unit in front of them, so
 * rendering siblings for all seven would cost 7x the tokens (one prompt per
 * (unit, rubric) pair) for six rubrics with no clause that can use it. Widening
 * this set is one line plus a test, and is a decision someone should make
 * deliberately rather than inherit. Spec criterion 4 is restated as
 * rubric-scoped on exactly this argument.
 */
export const SIBLING_AWARE_RUBRIC_IDS: ReadonlySet<string> = new Set(['CODE-R004']);

/**
 * Conservative-confidence system prompt. Readability judgments are inherently
 * softer than rule-based checks, so the LLM is biased toward `medium` and told
 * to return `null` freely — a report full of low-value nits erodes trust faster
 * than a missed nicety.
 */
export const CRITIQUE_SYSTEM_PROMPT =
  'You are a senior engineer critiquing a SINGLE code unit (a function, method, or class) ' +
  'against a SINGLE craft rubric. You judge the CEILING — does the code reveal intent, is the ' +
  'control flow honest, does it tell one story, does the abstraction earn its keep, is it as ' +
  'simple as it could be, does the signature keep its promise, would a senior nod or wince. You ' +
  'do NOT judge the floor (dead code, lint, layering, complexity thresholds, CVEs) — those are ' +
  'handled elsewhere. Respond ONLY with a fenced JSON block.\n\n' +
  'CONFIDENCE POLICY (critical):\n' +
  '- Default to "medium". Use "high" ONLY when you can quote the specific construct and name ' +
  'the concrete improvement.\n' +
  '- Use "low" when you sense a shape problem but cannot justify it from the snippet alone.\n' +
  '- If the rubric does not apply OR the unit already clears this bar, return `null` (the ' +
  'literal word null inside the JSON block). Do not invent findings, and do not restate what ' +
  'another rubric would already catch.';

export interface CritiqueInput {
  file: string;
  source: string;
  unit: CodeUnit;
  rubric: CodeRubric;
  provider: LlmProvider;
  /**
   * Other locations sharing this unit's normalized token shape. Spec-literal
   * (`siblings?: CloneMember[]`) and self-excluded. Absent — not empty — when
   * the unit belongs to no clone class, so the no-siblings prompt stays
   * byte-identical to the pre-change one.
   */
  siblings?: readonly CloneMember[];
  /**
   * The owning clone class, for `tokenCount` / `signal` / `sharedImport`.
   * Separate from `siblings` because `siblings` is the self-EXCLUDED list and
   * this is the class it came from; `resolveSiblingEvidence` is the only
   * construction site, so the pair cannot desync. Optional independently: a
   * caller following the spec's literal wording passes `siblings` alone and gets
   * the locations without the token count or the signal.
   */
  siblingClass?: CloneClass;
}

export async function critiqueOne(input: CritiqueInput): Promise<CodeFinding | null> {
  const { file, unit, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, { systemPrompt: CRITIQUE_SYSTEM_PROMPT });
  return parseFindingFromRaw(raw, { file, unit, rubric });
}

/**
 * Parse a raw LLM response (fenced JSON) into a CodeFinding. Returns null
 * when the response says null / fails validation. Pure — no LLM call — so
 * the in-session two-step flow can reuse it after the calling agent answers.
 */
export function parseFindingFromRaw(
  raw: string,
  ctx: { file: string; unit: CodeUnit; rubric: CodeRubric }
): CodeFinding | null {
  const { file, unit, rubric } = ctx;
  const parsed = parseFencedJson(raw);
  if (parsed === null) return null;
  if (typeof parsed !== 'object') return null;

  const tier = parsed.tier as Tier;
  const impact = parsed.impact as Impact;
  const confidence = parsed.confidence as Confidence;
  if (!isTier(tier) || !isImpact(impact) || !isConfidence(confidence)) return null;
  if (typeof parsed.message !== 'string' || parsed.message.length === 0) return null;

  return {
    code: rubric.id,
    phase: 'critique',
    tier,
    impact,
    confidence,
    target: { file, unit: unit.name, kind: unit.kind, line: unit.line },
    message: parsed.message,
    cite: { rubricId: rubric.id, source: rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

export interface BuildPromptInput {
  file: string;
  source: string;
  unit: CodeUnit;
  rubric: CodeRubric;
  /**
   * Other locations sharing this unit's normalized token shape. Spec-literal
   * (`siblings?: CloneMember[]`) and self-excluded. Absent — not empty — when
   * the unit belongs to no clone class, so the no-siblings prompt stays
   * byte-identical to the pre-change one.
   */
  siblings?: readonly CloneMember[];
  /**
   * The owning clone class, for `tokenCount` / `signal` / `sharedImport`.
   * Separate from `siblings` because `siblings` is the self-EXCLUDED list and
   * this is the class it came from; `resolveSiblingEvidence` is the only
   * construction site, so the pair cannot desync. Optional independently: a
   * caller following the spec's literal wording passes `siblings` alone and gets
   * the locations without the token count or the signal.
   */
  siblingClass?: CloneClass;
}

export function buildPrompt(input: BuildPromptInput): string {
  const { file, source, unit, rubric, siblings, siblingClass } = input;
  const snippet = unitSource(source, unit, MAX_UNIT_CHARS);
  // All three terms are load-bearing and each is pinned by its own
  // byte-identity case: `!== undefined` keeps the no-clone-class prompt
  // untouched, `length > 0` rejects a present-but-empty array (a header over
  // zero locations is worse than no header), and the rubric gate is what keeps
  // the other six rubrics' prompts identical for a unit that DOES have
  // siblings. Spreading `[]` splices nothing, so the no-siblings array is the
  // same array it was — truth 2 is structural rather than a promise.
  const evidence =
    siblings !== undefined && siblings.length > 0 && SIBLING_AWARE_RUBRIC_IDS.has(rubric.id)
      ? renderSiblingEvidence(siblings, siblingClass)
      : [];
  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `File: ${file}`,
    `Unit: kind=${unit.kind}, name=${unit.name}, line=${unit.line}`,
    '',
    'Code unit under review:',
    '```',
    snippet,
    '```',
    '',
    ...evidence,
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the unit already clears this bar, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique naming the specific construct and a concrete suggested revision>" }`',
    '',
    'Remember the confidence policy: medium by default; high requires a specific quotable construct.',
  ].join('\n');
}

function parseFencedJson(raw: string): Record<string, unknown> | null {
  const body = extractFencedJsonPayload(raw);
  if (body === 'null') return null;
  try {
    // harness-ignore SEC-DES-001: parses LLM model output; typeof check below gates shape, downstream callers re-validate fields
    const parsed: unknown = JSON.parse(body);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isTier(v: unknown): v is Tier {
  return v === 'foundational' || v === 'polish' || v === 'aspirational';
}
function isImpact(v: unknown): v is Impact {
  return v === 'small' || v === 'medium' || v === 'large';
}
function isConfidence(v: unknown): v is Confidence {
  return v === 'high' || v === 'medium' || v === 'low';
}
