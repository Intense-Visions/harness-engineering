/**
 * CRITIQUE phase — invokes the LLM provider per (command, rubric) pair and
 * parses a 3-axis finding from the response. Matches the fenced-JSON parser
 * contract used across the craft family.
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { CliRubric, CommandKind } from '../catalog/rubrics/index.js';
import type { CliErgonomicsFinding, Tier, Impact, Confidence } from '../findings/schema.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';

const MAX_CONTENT_CHARS = 6000;

export interface CritiqueInput {
  file: string;
  /** Relative path from the project root for the finding's target.relative. */
  relative: string;
  kind: CommandKind;
  content: string;
  rubric: CliRubric;
  provider: LlmProvider;
}

export async function critiqueOne(input: CritiqueInput): Promise<CliErgonomicsFinding | null> {
  const { file, relative, kind, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, {
    systemPrompt:
      'You are a senior CLI/developer-experience engineer critiquing a single command ' +
      'definition against a single craft rubric. You judge the CEILING (are names predictable, ' +
      'does help teach, are errors actionable, are defaults sane, is output scannable, does it ' +
      'compose, are destructive actions guarded), not the floor (does the flag exist, does the ' +
      'file compile) — those are handled elsewhere. Reason from the command definition source. ' +
      'Respond ONLY with a fenced JSON block. If the rubric does not apply or the command ' +
      'already clears this bar, return `null` (literally the word null inside the JSON block).',
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
    `Command definition file: ${file}`,
    `Relative path: ${relative}`,
    `Command kind: ${kind}`,
    '',
    'Command definition source:',
    '```',
    body,
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the command already clears this bar, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "a critique naming the specific command/flag/handler and a concrete suggested change" }`',
  ].join('\n');
}

function parseFencedJson(raw: string): Record<string, unknown> | null {
  const match = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(raw);
  const body = (match?.[1] ?? raw).trim();
  if (body === 'null') return null;
  return parseJsonObject(body);
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    // harness-ignore SEC-DES-001: parses LLM model output; typeof check below gates shape, downstream callers re-validate fields
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || typeof parsed !== 'object') return null;
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
