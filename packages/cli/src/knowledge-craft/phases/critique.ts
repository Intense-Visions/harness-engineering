/**
 * CRITIQUE phase — invokes the LLM provider per (file, rubric) pair and
 * parses 3-axis findings from the response. Matches the fenced-JSON
 * parser contract used across the craft family.
 *
 * Source: docs/changes/craft-pipeline/knowledge-craft/proposal.md
 *   (Technical Design → Critique phase).
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { KnowledgeRubric } from '../catalog/rubrics/index.js';
import type { KnowledgeFinding, Tier, Impact, Confidence } from '../findings/schema.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js';

const MAX_CONTENT_CHARS = 4000;

/** System prompt for knowledge-entry critique. */
export const CRITIQUE_SYSTEM_PROMPT =
  'You are a senior engineer + technical writer critiquing a single knowledge entry ' +
  'against a single rubric. Respond ONLY with a fenced JSON block. If the rubric does ' +
  'not apply or the entry is fine, return `null` (literally the word null inside the JSON block).';

export interface CritiqueInput {
  file: string;
  /** Relative path from docs/knowledge/ for the finding's target.relative. */
  relative: string;
  content: string;
  rubric: KnowledgeRubric;
  provider: LlmProvider;
}

/** buildPrompt / parseFindingFromRaw inputs (the LLM-free subset of CritiqueInput). */
export type BuildPromptInput = Omit<CritiqueInput, 'provider'>;

export async function critiqueOne(input: CritiqueInput): Promise<KnowledgeFinding | null> {
  const { file, relative, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, { systemPrompt: CRITIQUE_SYSTEM_PROMPT });
  return parseFindingFromRaw(raw, { file, relative, rubric });
}

/**
 * Parse a raw LLM response (fenced JSON) into a KnowledgeFinding. Pure — no
 * LLM call — so the in-session two-step flow can reuse it after the calling
 * agent answers.
 */
export function parseFindingFromRaw(
  raw: string,
  ctx: { file: string; relative: string; rubric: KnowledgeRubric }
): KnowledgeFinding | null {
  const { file, relative, rubric } = ctx;
  const parsed = parseFencedJson(raw);
  if (parsed === null) return null;
  if (typeof parsed !== 'object') return null;

  const tier = parsed.tier as Tier;
  const impact = parsed.impact as Impact;
  const confidence = parsed.confidence as Confidence;
  if (!isTier(tier) || !isImpact(impact) || !isConfidence(confidence)) return null;
  if (typeof parsed.message !== 'string' || parsed.message.trim().length === 0) return null;

  return {
    code: rubric.id,
    phase: 'critique',
    tier,
    impact,
    confidence,
    target: { file, relative },
    message: parsed.message,
    cite: { rubricId: rubric.id, source: rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

export function buildPrompt(input: BuildPromptInput): string {
  const { file, relative, content, rubric } = input;
  const body =
    content.length > MAX_CONTENT_CHARS
      ? content.slice(0, MAX_CONTENT_CHARS) + '\n[…truncated for cost…]'
      : content;
  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `Knowledge entry file: ${file}`,
    `Relative path (under docs/knowledge/): ${relative}`,
    '',
    'Entry contents:',
    '```markdown',
    body,
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the entry is fine, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique with concrete suggested revision when possible>" }`',
  ].join('\n');
}

function parseFencedJson(raw: string): Record<string, unknown> | null {
  const body = extractFencedJsonPayload(raw);
  if (body.trim() === 'null') return null;
  try {
    // harness-ignore SEC-DES-001: parses LLM model output; typeof check on next line gates shape, downstream callers re-validate fields
    const parsed = JSON.parse(body);
    if (parsed === null) return null;
    if (typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
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
