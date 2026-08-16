/**
 * CRITIQUE phase — invokes the LLM provider per (surface, rubric) pair where
 * the rubric's `appliesTo` includes the surface's kind, and parses a 3-axis
 * finding from the response. Matches the fenced-JSON parser contract used
 * across the craft family (design-craft / naming-craft / docs-craft /
 * code-craft / cli-ergonomics-craft).
 *
 * The prompt carries the API-surface source (truncated for cost) plus its kind,
 * and a conservative-confidence system prompt keeps judgment-based API findings
 * honest per ADR 0019.
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { ApiRubric, ApiSurfaceKind } from '../catalog/rubrics/index.js';
import type { ApiFinding, Tier, Impact, Confidence } from '../findings/schema.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js';

const MAX_CONTENT_CHARS = 8000;

export const CRITIQUE_SYSTEM_PROMPT =
  'You are a senior API designer critiquing a single API surface (an OpenAPI/Swagger document ' +
  'or a route/handler definition) against a single craft rubric. You judge the CEILING — is the ' +
  'endpoint at the right abstraction, is the HTTP verb honest, does the resource name belong in ' +
  'the URL or a query param, would a stranger predict the response shape, does the error tell ' +
  'the consumer what to do, is the mutation idempotency-honest, does the shape model the domain ' +
  'or leak the implementation, does it evolve without breaking consumers. You do NOT judge the ' +
  'floor (does the path exist, does the schema validate, is it documented) — that is handled ' +
  'elsewhere. Respond ONLY with a fenced JSON block.\n\n' +
  'CONFIDENCE POLICY (critical):\n' +
  '- Default to "medium". Use "high" ONLY when you can quote the specific path/method/field/status ' +
  'and name the concrete improvement.\n' +
  '- Use "low" when you sense a shape problem but cannot justify it from the source alone (e.g. a ' +
  'route handler whose response shape is built elsewhere).\n' +
  '- If the rubric does not apply OR the surface already clears this bar, return `null` (the ' +
  'literal word null inside the JSON block). Do not invent findings.';

export interface CritiqueInput {
  file: string;
  /** Relative path from the project root for the finding's target.relative. */
  relative: string;
  kind: ApiSurfaceKind;
  content: string;
  rubric: ApiRubric;
  provider: LlmProvider;
}

export async function critiqueOne(input: CritiqueInput): Promise<ApiFinding | null> {
  const { file, relative, kind, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, { systemPrompt: CRITIQUE_SYSTEM_PROMPT });
  return parseFindingFromRaw(raw, { file, relative, kind, rubric });
}

/**
 * Parse a raw LLM response (fenced JSON) into an ApiFinding. Returns null
 * when the response says null / fails validation. Pure — no LLM call — so
 * the in-session two-step flow can reuse it after the calling agent answers.
 */
export function parseFindingFromRaw(
  raw: string,
  ctx: { file: string; relative: string; kind: ApiSurfaceKind; rubric: ApiRubric }
): ApiFinding | null {
  const { file, relative, kind, rubric } = ctx;
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

export interface BuildPromptInput {
  file: string;
  relative: string;
  kind: ApiSurfaceKind;
  content: string;
  rubric: ApiRubric;
}

export function buildPrompt(input: BuildPromptInput): string {
  const { file, relative, kind, content, rubric } = input;
  const body =
    content.length > MAX_CONTENT_CHARS
      ? content.slice(0, MAX_CONTENT_CHARS) + '\n[…truncated for cost…]'
      : content;
  const kindLabel =
    kind === 'openapi' ? 'OpenAPI / Swagger specification document' : 'route / handler definition';
  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `API-surface file: ${file}`,
    `Relative path: ${relative}`,
    `Surface kind: ${kind} (${kindLabel})`,
    '',
    'API-surface source:',
    '```',
    body,
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the surface already clears this bar, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "a critique naming the specific path/method/field/status and a concrete suggested change" }`',
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
