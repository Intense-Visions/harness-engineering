// packages/cli/src/design-craft/phases/critique.ts
//
// CRITIQUE phase implementation.
//
// For each (target × rubric) pair:
//   1. Read the target's source code
//   2. Format the rubric's prompt template with the target identifier +
//      source
//   3. Call provider.callText
//   4. Parse the response into a CraftFinding (3-axis: tier/impact/confidence)
//   5. Compute the derived priority via findings/derived.ts
//
// Honors ADR 0019 — the 3-axis output is the LLM's responsibility. The
// parser preserves whatever tier/impact/confidence the LLM emits; it
// NEVER silently upgrades a 'low' confidence to 'high' or filters low-
// confidence findings out. That's a downstream presentation concern.
//
// Honors ADR 0018 — robust parsing of imperfect LLM output. The LLM may
// emit:
//   - A clean fenced ```json``` block (happy path)
//   - A fenced block with the wrong language tag (```ts, ```)
//   - Bare JSON with no fence
//   - JSON with extra prose before/after
// All four shapes are accepted by `parseFindingResponse`. Unparseable
// responses become a 'low'-confidence sentinel finding so the run doesn't
// silently drop a target.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CraftFinding, Tier, Impact, Confidence } from '../findings/schema.js';
import { derivePriority } from '../findings/derived.js';
import type { RubricDefinition } from '../catalog/rubrics/hierarchy-clarity.js';
import type { LlmProvider } from '../llm/provider.js';

/** A target component / file to critique. */
export interface CritiqueTarget {
  /** Absolute or project-relative path to the source file. */
  file: string;
  /** Optional component identifier (display name in the finding). */
  component?: string;
  /**
   * Optional in-memory source override (test fixtures + non-disk sources).
   * If absent, the file is read from disk.
   */
  source?: string;
}

export interface CritiqueArgs {
  targets: CritiqueTarget[];
  rubrics: RubricDefinition[];
  provider: LlmProvider;
}

const TIER_VALUES: readonly Tier[] = ['foundational', 'polish', 'aspirational'];
const IMPACT_VALUES: readonly Impact[] = ['small', 'medium', 'large'];
const CONFIDENCE_VALUES: readonly Confidence[] = ['high', 'medium', 'low'];

function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIER_VALUES as readonly string[]).includes(v);
}
function isImpact(v: unknown): v is Impact {
  return typeof v === 'string' && (IMPACT_VALUES as readonly string[]).includes(v);
}
function isConfidence(v: unknown): v is Confidence {
  return typeof v === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(v);
}

/**
 * Parsed shape extracted from the LLM's response. Internal — public
 * findings are typed as CraftFinding.
 */
interface ParsedRubricResponse {
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  message: string;
}

/**
 * Permissive JSON extraction. Tries (in order):
 *   1. fenced ```json``` block
 *   2. fenced block with any language tag
 *   3. raw JSON object substring (first `{` ... last `}` balanced)
 *
 * Returns null if no parseable block is found.
 */
function extractJson(raw: string): unknown {
  // 1. Fenced JSON
  const fencedJson = /```json\s*([\s\S]*?)\s*```/i.exec(raw);
  if (fencedJson?.[1]) {
    try {
      return JSON.parse(fencedJson[1]);
    } catch {
      // fall through
    }
  }

  // 2. Fenced any-language
  const fencedAny = /```[a-z]*\s*([\s\S]*?)\s*```/i.exec(raw);
  if (fencedAny?.[1]) {
    try {
      return JSON.parse(fencedAny[1]);
    } catch {
      // fall through
    }
  }

  // 3. First-brace-to-last-brace substring
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Validate an extracted JSON object against the rubric-response shape.
 *
 * Returns null when validation fails so the caller can emit a sentinel
 * low-confidence finding rather than crashing the whole CRITIQUE run on
 * one malformed LLM response.
 */
function validateParsed(value: unknown): ParsedRubricResponse | null {
  if (value === null || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (!isTier(obj.tier)) return null;
  if (!isImpact(obj.impact)) return null;
  if (!isConfidence(obj.confidence)) return null;
  if (typeof obj.message !== 'string' || obj.message.trim().length === 0) {
    return null;
  }
  return {
    tier: obj.tier,
    impact: obj.impact,
    confidence: obj.confidence,
    message: obj.message,
  };
}

/**
 * Exposed for tests + downstream consumers — turns a raw LLM string into a
 * structured rubric response or null (caller decides on sentinel behavior).
 */
export function parseFindingResponse(raw: string): ParsedRubricResponse | null {
  const json = extractJson(raw);
  return validateParsed(json);
}

function readSource(target: CritiqueTarget): string {
  if (typeof target.source === 'string') return target.source;
  // Tests / callers can pass relative paths; resolve against cwd
  const resolved = path.isAbsolute(target.file)
    ? target.file
    : path.resolve(process.cwd(), target.file);
  return fs.readFileSync(resolved, 'utf8');
}

function formatPrompt(template: string, targetId: string, source: string): string {
  return template.replace(/\{target\}/g, targetId).replace(/\{source\}/g, source);
}

/**
 * Build a finding from a successfully-parsed LLM response.
 */
function buildFinding(
  target: CritiqueTarget,
  rubric: RubricDefinition,
  parsed: ParsedRubricResponse
): CraftFinding {
  return {
    code: rubric.findingTemplate.code,
    phase: 'critique',
    tier: parsed.tier,
    impact: parsed.impact,
    confidence: parsed.confidence,
    target: {
      file: target.file,
      ...(target.component ? { component: target.component } : {}),
    },
    message: parsed.message,
    cite: {
      rubricOrPatternId: rubric.id,
      source: rubric.source.url ?? rubric.source.ref,
    },
    derived: { priority: derivePriority(parsed.tier, parsed.impact, parsed.confidence) },
  };
}

/**
 * Sentinel finding produced when the LLM response cannot be parsed. Per
 * ADR 0018 we never silently drop a target — we emit a low-confidence
 * finding flagging the parse failure so the operator sees it.
 */
function buildSentinelFinding(
  target: CritiqueTarget,
  rubric: RubricDefinition,
  rawResponse: string
): CraftFinding {
  const tier: Tier = rubric.findingTemplate.tier;
  const impact: Impact = 'small';
  const confidence: Confidence = 'low';
  return {
    code: rubric.findingTemplate.code,
    phase: 'critique',
    tier,
    impact,
    confidence,
    target: {
      file: target.file,
      ...(target.component ? { component: target.component } : {}),
    },
    message: `LLM response could not be parsed for rubric ${rubric.id}. Treat this finding as a parse-failure signal, not a craft judgment. Raw response prefix: ${rawResponse.slice(0, 120)}`,
    cite: {
      rubricOrPatternId: rubric.id,
      source: rubric.source.url ?? rubric.source.ref,
    },
    derived: { priority: derivePriority(tier, impact, confidence) },
  };
}

/**
 * Run the CRITIQUE phase over `targets × rubrics`.
 *
 * Each (target, rubric) pair produces exactly one CraftFinding — either a
 * parsed real finding or a low-confidence sentinel on parse failure. The
 * order of the returned array is `targets × rubrics` row-major (stable
 * across runs).
 *
 * MVP scope: no parallelism. Sequential awaits keep cost telemetry
 * deterministic; productionization can batch later.
 */
export async function runCritique(args: CritiqueArgs): Promise<CraftFinding[]> {
  const findings: CraftFinding[] = [];
  for (const target of args.targets) {
    const source = readSource(target);
    const targetId = target.component ?? target.file;
    for (const rubric of args.rubrics) {
      const prompt = formatPrompt(rubric.prompt, targetId, source);
      const raw = await args.provider.callText(prompt);
      const parsed = parseFindingResponse(raw);
      findings.push(
        parsed ? buildFinding(target, rubric, parsed) : buildSentinelFinding(target, rubric, raw)
      );
    }
  }
  return findings;
}

/** A rendered component screenshot to critique in deep (vision) mode. */
export interface VisionCritiqueTarget {
  /** Path to the source file the screenshot renders (for finding attribution). */
  file: string;
  /** Optional component identifier (display name in the finding). */
  component?: string;
  /** Path to the rendered screenshot (PNG / JPEG / WebP). */
  image: string;
}

export interface VisionCritiqueArgs {
  targets: VisionCritiqueTarget[];
  rubrics: RubricDefinition[];
  provider: LlmProvider;
}

function readImage(imagePath: string): {
  imageBuffer: Buffer;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
} {
  const resolved = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
  const imageBuffer = fs.readFileSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mediaType =
    ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  return { imageBuffer, mediaType };
}

/**
 * Run the CRITIQUE phase in deep (vision) mode over `targets × rubrics`. Mirrors
 * {@link runCritique} but judges the *rendered screenshot* via the provider's
 * vision channel instead of the source code — the difference that distinguishes
 * `mode: 'deep'` from `mode: 'fast'`. Each (target, rubric) pair yields exactly
 * one finding (real or low-confidence parse-failure sentinel), row-major stable.
 */
export async function runVisionCritique(args: VisionCritiqueArgs): Promise<CraftFinding[]> {
  const findings: CraftFinding[] = [];
  for (const target of args.targets) {
    const image = readImage(target.image);
    const targetId = target.component ?? target.file;
    for (const rubric of args.rubrics) {
      const prompt = formatPrompt(
        rubric.prompt,
        targetId,
        '(the rendered component is attached as an image — judge the visual result, not source code)'
      );
      const raw = await args.provider.callVision(prompt, image);
      const parsed = parseFindingResponse(raw);
      findings.push(
        parsed ? buildFinding(target, rubric, parsed) : buildSentinelFinding(target, rubric, raw)
      );
    }
  }
  return findings;
}
