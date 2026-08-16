/**
 * CRITIQUE phase — invokes the LLM provider per (doc, rubric) pair and parses
 * a 3-axis finding from the response. Matches the fenced-JSON parser contract
 * used across the craft family.
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { DocsRubric, DocKind } from '../catalog/rubrics/index.js';
import type { DocsFinding, Tier, Impact, Confidence } from '../findings/schema.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js';

const MAX_CONTENT_CHARS = 6000;

export interface CritiqueInput {
  file: string;
  /** Relative path from the project root for the finding's target.relative. */
  relative: string;
  kind: DocKind;
  content: string;
  rubric: DocsRubric;
  provider: LlmProvider;
}

export async function critiqueOne(input: CritiqueInput): Promise<DocsFinding | null> {
  const { file, relative, kind, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, {
    systemPrompt:
      'You are a senior technical writer critiquing a single documentation file against a ' +
      'single craft rubric. You judge the CEILING (does it teach, is the prose alive, do ' +
      'examples earn their place), not the floor (broken links, missing files) — those are ' +
      'handled elsewhere. Respond ONLY with a fenced JSON block. If the rubric does not apply ' +
      'or the doc already clears this bar, return `null` (literally the word null inside the ' +
      'JSON block).',
  });
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
    target: { file, relative, kind },
    message: parsed.message,
    cite: { rubricId: rubric.id, source: rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

function buildPrompt(input: CritiqueInput): string {
  const { file, relative, kind, content, rubric } = input;
  const body =
    content.length > MAX_CONTENT_CHARS
      ? content.slice(0, MAX_CONTENT_CHARS) + '\n[…truncated for cost…]'
      : content;
  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `Documentation file: ${file}`,
    `Relative path: ${relative}`,
    `Doc kind: ${kind}`,
    '',
    'Document contents:',
    '```markdown',
    body,
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the doc already clears this bar, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique naming the specific passage and a concrete suggested revision>" }`',
  ].join('\n');
}

/** Narrow parsed JSON to a plain object, rejecting null/arrays/primitives. */
function asJsonObject(parsed: unknown): Record<string, unknown> | null {
  if (parsed === null || typeof parsed !== 'object') return null;
  return parsed as Record<string, unknown>;
}

function parseFencedJson(raw: string): Record<string, unknown> | null {
  const body = extractFencedJsonPayload(raw);
  if (body === 'null') return null;
  try {
    // harness-ignore SEC-DES-001: parses LLM model output; asJsonObject gates shape, downstream callers re-validate fields
    return asJsonObject(JSON.parse(body));
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
