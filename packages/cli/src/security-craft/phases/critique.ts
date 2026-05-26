/**
 * CRITIQUE phase — invokes the LLM provider per (file, signal, rubric)
 * triple where the rubric's appliesToSignals includes the signal's kind.
 * Builds prompts with a 1500-char window AROUND the signal line (not the
 * whole file), and biases the system prompt toward MEDIUM confidence to
 * mitigate the FP risk flagged in the roadmap for judgment-based security.
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   (Technical Design → Critique phase + Decisions #3 conservative confidence).
 */

import type { LlmProvider } from '../../shared/craft/llm/provider.js';
import type { SecurityRubric } from '../catalog/rubrics/index.js';
import type {
  SecurityFinding,
  SecuritySignal,
  Tier,
  Impact,
  Confidence,
} from '../findings/schema.js';
import { derivePriority } from '../../shared/craft/findings/derived.js';

const CONTEXT_WINDOW_CHARS = 1500;

/**
 * Conservative-confidence system prompt — Decision #3 from the spec.
 *
 * Biases the LLM toward `medium` confidence by default; high requires a
 * specific named anti-pattern or visible missing guard. Per ADR 0019,
 * low/medium-confidence findings are de-emphasized in reports, so this
 * keeps the report trustworthy for users.
 */
const SYSTEM_PROMPT =
  'You are a senior security engineer critiquing a SINGLE security-relevant code ' +
  'snippet against a SINGLE rubric. Respond ONLY with a fenced JSON block.\n\n' +
  'CONFIDENCE POLICY (critical):\n' +
  '- Default to "medium" confidence unless the snippet contains a SPECIFIC, NAMED ' +
  'anti-pattern or a clearly missing guard you can quote.\n' +
  '- Use "high" confidence ONLY when you can point to a specific line and explain ' +
  'the exact flow that makes the issue concrete.\n' +
  '- Use "low" confidence when you suspect a shape problem but cannot verify it ' +
  'from the snippet alone.\n' +
  '- If the rubric does not apply OR the code is fine, return `null` (the literal ' +
  'word null inside the JSON block). Do not invent findings.';

export interface CritiqueInput {
  file: string;
  source: string;
  signal: SecuritySignal;
  rubric: SecurityRubric;
  provider: LlmProvider;
}

export async function critiqueOne(input: CritiqueInput): Promise<SecurityFinding | null> {
  const { file, signal, rubric, provider } = input;
  const prompt = buildPrompt(input);
  const raw = await provider.callText(prompt, { systemPrompt: SYSTEM_PROMPT });
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
    target: { file, signal: signal.marker, line: signal.line },
    message: parsed.message,
    cite: { rubricId: rubric.id, source: rubric.source },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

function buildPrompt(input: CritiqueInput): string {
  const { file, source, signal, rubric } = input;
  const window = sliceAroundLine(source, signal.line, CONTEXT_WINDOW_CHARS);
  return [
    `Rubric: ${rubric.title} (${rubric.id})`,
    `Source: ${rubric.source}`,
    `Description: ${rubric.description}`,
    '',
    `File: ${file}`,
    `Signal: kind=${signal.kind}, marker=${signal.marker}, line=${signal.line}`,
    '',
    'Code snippet (window around signal):',
    '```',
    window,
    '```',
    '',
    'Respond with a fenced JSON block. Either:',
    '- `null` (literal) if the rubric does not apply OR the code is fine, OR',
    '- `{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique with concrete suggested revision when possible>" }`',
    '',
    'Remember the confidence policy: medium by default; high requires a specific named anti-pattern.',
  ].join('\n');
}

/**
 * Returns a substring centered on the given 1-based line, capped at
 * `maxChars`. If the surrounding text is shorter than `maxChars`, the
 * full source is returned.
 */
function sliceAroundLine(source: string, line: number, maxChars: number): string {
  if (source.length <= maxChars) return source;
  const lines = source.split('\n');
  const targetIdx = Math.max(0, Math.min(lines.length - 1, line - 1));
  // Expand outward from the target line until we exceed maxChars.
  let lo = targetIdx;
  let hi = targetIdx;
  let len = lines[targetIdx]?.length ?? 0;
  while (len < maxChars && (lo > 0 || hi < lines.length - 1)) {
    if (lo > 0) {
      lo--;
      len += (lines[lo]?.length ?? 0) + 1;
      if (len >= maxChars) break;
    }
    if (hi < lines.length - 1) {
      hi++;
      len += (lines[hi]?.length ?? 0) + 1;
    }
  }
  return lines.slice(lo, hi + 1).join('\n');
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
