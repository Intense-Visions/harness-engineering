/**
 * CRITIQUE phase — invokes the LLM provider per (file, section, rubric)
 * triple and parses 3-axis findings from the response. Matches the
 * design-craft / naming-craft fenced-JSON parser contract.
 *
 * Source: docs/changes/craft-pipeline/spec-craft/proposal.md
 *   (Technical Design → Critique phase).
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { SpecRubric } from '../catalog/rubrics/index.js';
import type { ParsedSection } from '../extract/sections.js';
import type { SpecFinding } from '../findings/schema.js';
import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js';

const MAX_BODY_CHARS = 2000;

export interface CritiqueInput {
  file: string;
  section: ParsedSection;
  rubric: SpecRubric;
  provider: LlmProvider;
}

export async function critiqueOne(input: CritiqueInput): Promise<SpecFinding | null> {
  const { file, section, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, {
    systemPrompt:
      'You are a senior engineer critiquing a single spec section against a single ' +
      'rubric. Respond ONLY with a fenced JSON block. If the rubric does not apply or ' +
      'the section is fine, return `null` (literally the word null inside the JSON block).',
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
    target: {
      file,
      section: section.heading,
      line: section.line,
    },
    message: parsed.message,
    cite: { rubricId: rubric.id, source: rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

function buildPrompt(input: CritiqueInput): string {
  const { file, section, rubric } = input;
  const body =
    section.body.length > MAX_BODY_CHARS
      ? section.body.slice(0, MAX_BODY_CHARS) + '\n[…truncated for cost…]'
      : section.body;
  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `Spec file: ${file}`,
    `Section: ${section.heading}`,
    '',
    'Section body:',
    '```markdown',
    body,
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the section is fine, OR',
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
