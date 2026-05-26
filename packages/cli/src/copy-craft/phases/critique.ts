/**
 * CRITIQUE phase — invokes the LLM provider per (item, rubric) pair
 * and parses 3-axis findings from the response. Matches the
 * design-craft / naming-craft / spec-craft fenced-JSON parser contract.
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   (Technical Design → Critique phase).
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { CopyRubric } from '../catalog/rubrics/index.js';
import type { ExtractedCopyItem, CopyFinding } from '../findings/schema.js';
import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';

const MAX_SNIPPET_CHARS = 1500;

export interface CritiqueInput {
  item: ExtractedCopyItem;
  rubric: CopyRubric;
  provider: LlmProvider;
}

export async function critiqueOne(input: CritiqueInput): Promise<CopyFinding | null> {
  const { item, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, {
    systemPrompt:
      'You are a senior engineer critiquing a single piece of prose-in-code against a ' +
      'single rubric. Respond ONLY with a fenced JSON block. If the rubric does not apply ' +
      'or the copy is fine, return `null` (literally the word null inside the JSON block).',
  });
  const parsed = parseFencedJson(raw);
  if (parsed === null) return null;
  if (typeof parsed !== 'object') return null;

  const tier = parsed.tier as Tier;
  const impact = parsed.impact as Impact;
  const confidence = parsed.confidence as Confidence;
  if (!isTier(tier) || !isImpact(impact) || !isConfidence(confidence)) return null;
  if (typeof parsed.message !== 'string' || parsed.message.length === 0) return null;

  const target: CopyFinding['target'] = {
    file: item.file,
    surface: item.surface,
    snippet: item.snippet,
  };
  if (item.line !== undefined) target.line = item.line;

  return {
    code: rubric.id,
    phase: 'critique',
    tier,
    impact,
    confidence,
    target,
    message: parsed.message,
    cite: { rubricId: rubric.id, source: rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

function buildPrompt(input: CritiqueInput): string {
  const { item, rubric } = input;
  const snippet =
    item.snippet.length > MAX_SNIPPET_CHARS
      ? item.snippet.slice(0, MAX_SNIPPET_CHARS) + '\n[…truncated…]'
      : item.snippet;

  const contextLines = [`Surface: ${item.surface}`, `File: ${item.file}`];
  if (item.line !== undefined) contextLines.push(`Line: ${item.line}`);
  if (item.context.errorType !== undefined)
    contextLines.push(`Error class: ${item.context.errorType}`);
  if (item.context.logLevel !== undefined) contextLines.push(`Log level: ${item.context.logLevel}`);
  if (item.context.ref !== undefined) contextLines.push(`Ref: ${item.context.ref}`);

  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    ...contextLines,
    '',
    'Copy snippet:',
    '```',
    snippet,
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the copy is fine, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique with concrete suggested rewrite when possible>" }`',
  ].join('\n');
}

function parseFencedJson(raw: string): Record<string, unknown> | null {
  const match = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(raw);
  const body = match !== null ? match[1]! : raw;
  if (body.trim() === 'null') return null;
  try {
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
