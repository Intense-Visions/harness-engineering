/**
 * CRITIQUE phase — invokes the LLM provider per (identifier, rubric)
 * pair and parses 3-axis findings from the response. Matches design-
 * craft's fenced-JSON parser contract.
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Technical Design → Critique phase).
 */

import type { LlmProvider } from '../llm/provider.js';
import type { NamingRubric } from '../catalog/rubrics/index.js';
import type {
  NamingFinding,
  ProjectConvention,
  Tier,
  Impact,
  Confidence,
} from '../findings/schema.js';
import type { ExtractedIdentifier } from '../extract/identifiers.js';
import { derivePriority } from '../findings/derived.js';

export interface CritiqueInput {
  identifier: ExtractedIdentifier;
  rubric: NamingRubric;
  convention: ProjectConvention;
  provider: LlmProvider;
}

export const CRITIQUE_SYSTEM_PROMPT =
  'You are a senior engineer critiquing identifier names against a single naming rubric. ' +
  'Respond ONLY with a fenced JSON block. If the rubric does not apply or the name is fine, ' +
  'return `null` (literally the word null inside the JSON block).';

export async function critiqueOne(input: CritiqueInput): Promise<NamingFinding | null> {
  const { identifier, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, { systemPrompt: CRITIQUE_SYSTEM_PROMPT });
  return parseFindingFromRaw(raw, { identifier, rubric });
}

/**
 * Parse a raw LLM response (fenced JSON) into a NamingFinding. Returns
 * null if the response says null / fails validation. Pure — no LLM call.
 */
export function parseFindingFromRaw(
  raw: string,
  ctx: { identifier: ExtractedIdentifier; rubric: NamingRubric }
): NamingFinding | null {
  const parsed = parseFencedJson(raw);
  if (parsed === null) return null;
  if (typeof parsed !== 'object') return null;

  const tier = parsed.tier as Tier;
  const impact = parsed.impact as Impact;
  const confidence = parsed.confidence as Confidence;
  if (!isTier(tier) || !isImpact(impact) || !isConfidence(confidence)) return null;
  if (typeof parsed.message !== 'string' || parsed.message.length === 0) return null;

  return {
    code: ctx.rubric.id,
    phase: 'critique',
    tier,
    impact,
    confidence,
    target: {
      file: ctx.identifier.file,
      line: ctx.identifier.line,
      identifier: ctx.identifier.name,
      kind: ctx.identifier.kind,
    },
    message: parsed.message,
    cite: { rubricId: ctx.rubric.id, source: ctx.rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

export interface BuildPromptInput {
  identifier: ExtractedIdentifier;
  rubric: NamingRubric;
  convention: ProjectConvention;
}

export function buildPrompt(input: BuildPromptInput): string {
  const { identifier, rubric, convention } = input;
  const conventionLine = describeConvention(identifier.kind, convention);
  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `Identifier: "${identifier.name}"`,
    `Kind: ${identifier.kind}`,
    `Exported: ${identifier.exported}`,
    `Scope size: ${identifier.scopeSize}`,
    conventionLine,
    '',
    'Context:',
    '```',
    identifier.contextLines.join('\n'),
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the name is fine, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique with suggested rename when possible>" }`',
  ].join('\n');
}

function describeConvention(
  kind: ExtractedIdentifier['kind'],
  convention: ProjectConvention
): string {
  const conv = convention[kindToConventionKey(kind)];
  if (conv === null)
    return 'Project convention: (no dominant convention detected — skip convention-conformance rubric)';
  return `Project convention for ${kind}: ${conv}`;
}

function kindToConventionKey(
  kind: ExtractedIdentifier['kind']
): 'variables' | 'functions' | 'types' {
  if (kind === 'variable') return 'variables';
  if (kind === 'function') return 'functions';
  return 'types';
}

function parseFencedJson(raw: string): Record<string, unknown> | null {
  const match = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(raw);
  const body = match !== null ? match[1]! : raw;
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
