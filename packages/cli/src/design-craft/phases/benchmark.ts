// packages/cli/src/design-craft/phases/benchmark.ts
//
// BENCHMARK phase implementation.
//
// For each target component, the BENCHMARK phase picks one or more
// exemplars of the same componentType (or a caller-supplied set) and asks
// the LLM to score the target on the 5-dim radar relative to the
// exemplar's reference scores.
//
// The LLM response must yield, for each of the five dimensions:
//   - score (0–100)
//   - confidence ('high' | 'medium' | 'low')
//   - notes (one short paragraph of justification)
// Plus a free-form `gaps` array — narrative observations of where the
// target falls short of the cited exemplars.
//
// `overall` is computed by the phase, not the LLM:
//   - score   = equal-weight mean of the five dimension scores (rounded)
//   - confidence = min of the five dimension confidences
// This rule was locked in the Phase 0 schema spike review (Phase 0
// observation O6 / Amendment A5). Documented as the Phase 1 first-task
// decision in plans/2026-05-23-design-craft-elevator-plan.md.
//
// Honors:
//   - ADR 0019: every dimension carries its own confidence (no aggregate
//     hiding low confidence on one axis).
//   - ADR 0020: exemplar.citationCount is incremented per cite (the
//     measurement layer wires this side-effect; the phase only emits the
//     `exemplars: string[]` provenance — usage measurement is a later
//     task per the plan).

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BenchmarkScore, RadarDimension, Confidence } from '../findings/schema.js';
import type { ExemplarDefinition } from '../catalog/exemplars/linear-empty-list.js';
import type { LlmProvider } from '../llm/provider.js';
import { computeAwardBar, applyResponsiveGate } from './award-bar.js';
import type { AwardBarConfig } from './award-bar.js';
import { CONFIDENCE_RANK } from '../../shared/craft/findings/axes.js';
import { computeResponsiveGate } from '../../responsive/index.js';
import type { ResponsiveMetrics, ResponsiveGateConfig } from '../../responsive/index.js';

export interface BenchmarkTarget {
  file: string;
  component: string;
  source?: string;
  /**
   * Component-type hint. If omitted, BENCHMARK uses ALL exemplars whose
   * componentType matches at least one provided exemplar — coarse but
   * good enough for MVP. Phase 3 wires a smarter discovery pass.
   */
  componentType?: string;
}

export interface BenchmarkArgs {
  targets: BenchmarkTarget[];
  exemplars: ExemplarDefinition[];
  provider: LlmProvider;
  /**
   * Award-bar thresholds (partial — merged over defaults). Controls the
   * machine award-tier verdict computed for each score. Omit for defaults
   * (80 / 0.95 / medium).
   */
  awardBar?: Partial<AwardBarConfig>;
  /**
   * Responsive gate inputs. `metrics` are per-target rendered layout metrics
   * (matched to a target by `file`); `config` tunes the gate thresholds;
   * `require` makes a `not-evaluated` gate downgrade a would-be `cleared` to
   * `indeterminate`. Omit entirely to leave every score `not-evaluated`.
   */
  responsive?: {
    metrics?: ResponsiveMetrics[];
    config?: Partial<ResponsiveGateConfig>;
    require?: boolean;
  };
}

const CONFIDENCE_VALUES: readonly Confidence[] = ['high', 'medium', 'low'];
function isConfidence(v: unknown): v is Confidence {
  return typeof v === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(v);
}

interface ParsedRadarDimension {
  score: number;
  confidence: Confidence;
  notes: string;
}

interface ParsedBenchmarkResponse {
  philosophicalCoherence: ParsedRadarDimension;
  hierarchy: ParsedRadarDimension;
  craftExecution: ParsedRadarDimension;
  function: ParsedRadarDimension;
  innovation: ParsedRadarDimension;
  gaps: string[];
}

function extractJson(raw: string): unknown {
  const fencedJson = /```json\s*([\s\S]*?)\s*```/i.exec(raw);
  if (fencedJson?.[1]) {
    try {
      return JSON.parse(fencedJson[1]);
    } catch {
      /* fall through */
    }
  }
  const fencedAny = /```[a-z]*\s*([\s\S]*?)\s*```/i.exec(raw);
  if (fencedAny?.[1]) {
    try {
      return JSON.parse(fencedAny[1]);
    } catch {
      /* fall through */
    }
  }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

function validateDimension(value: unknown): ParsedRadarDimension | null {
  if (value === null || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.score !== 'number' || obj.score < 0 || obj.score > 100) return null;
  if (!isConfidence(obj.confidence)) return null;
  if (typeof obj.notes !== 'string' || obj.notes.trim().length === 0) return null;
  return { score: obj.score, confidence: obj.confidence, notes: obj.notes };
}

function validateParsed(value: unknown): ParsedBenchmarkResponse | null {
  if (value === null || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const philosophicalCoherence = validateDimension(obj.philosophicalCoherence);
  const hierarchy = validateDimension(obj.hierarchy);
  const craftExecution = validateDimension(obj.craftExecution);
  const fn = validateDimension(obj.function);
  const innovation = validateDimension(obj.innovation);
  if (!philosophicalCoherence || !hierarchy || !craftExecution || !fn || !innovation) {
    return null;
  }
  if (!Array.isArray(obj.gaps) || !obj.gaps.every((g) => typeof g === 'string')) {
    return null;
  }
  return {
    philosophicalCoherence,
    hierarchy,
    craftExecution,
    function: fn,
    innovation,
    gaps: obj.gaps as string[],
  };
}

/** Exposed for tests + downstream consumers. */
export function parseBenchmarkResponse(raw: string): ParsedBenchmarkResponse | null {
  return validateParsed(extractJson(raw));
}

function readSource(target: BenchmarkTarget): string {
  if (typeof target.source === 'string') return target.source;
  const resolved = path.isAbsolute(target.file)
    ? target.file
    : path.resolve(process.cwd(), target.file);
  return fs.readFileSync(resolved, 'utf8');
}

/**
 * Confidence ordering. Used to compute the `overall.confidence` as the
 * MIN of the dimension confidences. Lower-confidence dimensions drag the
 * aggregate down — this is intentional. ADR 0019 demands honest
 * confidence; an aggregate that floats up to 'high' when one dimension is
 * 'low' is the failure mode this is designed to avoid.
 */
function minConfidence(confidences: readonly Confidence[]): Confidence {
  const first = confidences[0];
  if (first === undefined) return 'low';
  let min: Confidence = first;
  for (const c of confidences) {
    if (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[min]) min = c;
  }
  return min;
}

/**
 * Equal-weight mean of the five dimension scores. Rounded to the nearest
 * integer. The Phase 0 review recommendation; weighted overrides land in
 * Phase 3 via config (`design.craft.benchmark.weights`).
 */
function meanScore(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((s, n) => s + n, 0);
  return Math.round(sum / scores.length);
}

function buildScore(
  target: BenchmarkTarget,
  exemplars: ExemplarDefinition[],
  parsed: ParsedBenchmarkResponse,
  awardBarConfig?: Partial<AwardBarConfig>,
  responsive?: BenchmarkArgs['responsive']
): BenchmarkScore {
  const dims: RadarDimension[] = [
    parsed.philosophicalCoherence,
    parsed.hierarchy,
    parsed.craftExecution,
    parsed.function,
    parsed.innovation,
  ];
  const overallScore = meanScore(dims.map((d) => d.score));
  const overallConfidence = minConfidence(dims.map((d) => d.confidence));
  const radar: BenchmarkScore['radar'] = {
    philosophicalCoherence: parsed.philosophicalCoherence,
    hierarchy: parsed.hierarchy,
    craftExecution: parsed.craftExecution,
    function: parsed.function,
    innovation: parsed.innovation,
  };
  const aesthetic = computeAwardBar(radar, exemplars, awardBarConfig);
  const metricsForTarget = responsive?.metrics?.find((m) => m.file === target.file);
  const gate = computeResponsiveGate(metricsForTarget, responsive?.config);
  const awardBar = applyResponsiveGate(aesthetic, gate, {
    require: responsive?.require ?? false,
  });
  return {
    target: { file: target.file, component: target.component },
    exemplars: exemplars.map((e) => e.id),
    radar,
    overall: { score: overallScore, confidence: overallConfidence },
    gaps: parsed.gaps,
    awardBar,
  };
}

function selectExemplarsFor(
  target: BenchmarkTarget,
  allExemplars: ExemplarDefinition[]
): ExemplarDefinition[] {
  if (target.componentType === undefined) return allExemplars;
  return allExemplars.filter((e) => e.componentType === target.componentType);
}

function formatPrompt(
  target: BenchmarkTarget,
  exemplars: ExemplarDefinition[],
  source: string
): string {
  const exemplarSummaries = exemplars
    .map((e) =>
      [
        `--- Exemplar: ${e.name} (${e.id}) ---`,
        `URL: ${e.url}`,
        `Component type: ${e.componentType}`,
        `Why exemplar:`,
        e.whyExemplar,
        `Critique notes:`,
        e.critique,
        `Reference radar (0–100):`,
        `  philosophicalCoherence: ${e.radarReference.philosophicalCoherence}`,
        `  hierarchy:              ${e.radarReference.hierarchy}`,
        `  craftExecution:         ${e.radarReference.craftExecution}`,
        `  function:               ${e.radarReference.function}`,
        `  innovation:             ${e.radarReference.innovation}`,
      ].join('\n')
    )
    .join('\n\n');

  return [
    `Score ${target.component} (${target.file}) against the following exemplar(s) using the 5-dimension radar.`,
    '',
    exemplarSummaries,
    '',
    'Target source under review:',
    '```',
    source,
    '```',
    '',
    'Score the target 0–100 on each dimension, with per-dimension',
    'confidence (high|medium|low) and a one-sentence note. Also emit a',
    'short `gaps` array — narrative observations of where the target falls',
    'short of the cited exemplar(s). Do NOT compute an overall score —',
    'the phase computes it from your dimension scores.',
    '',
    'Respond with a single fenced ```json``` block:',
    '{',
    '  "philosophicalCoherence": { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "hierarchy":              { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "craftExecution":         { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "function":               { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "innovation":             { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "gaps": ["...", "..."]',
    '}',
  ].join('\n');
}

/**
 * Run the BENCHMARK phase. Returns one BenchmarkScore per target that has
 * at least one matching exemplar AND a successfully-parsed LLM response.
 * Targets with no matching exemplar are silently skipped (BENCHMARK is
 * opt-in per component type).
 */
export async function runBenchmark(args: BenchmarkArgs): Promise<BenchmarkScore[]> {
  const scores: BenchmarkScore[] = [];
  for (const target of args.targets) {
    const matched = selectExemplarsFor(target, args.exemplars);
    if (matched.length === 0) continue;
    const source = readSource(target);
    const prompt = formatPrompt(target, matched, source);
    const raw = await args.provider.callText(prompt);
    const parsed = parseBenchmarkResponse(raw);
    if (parsed === null) continue;
    scores.push(buildScore(target, matched, parsed, args.awardBar, args.responsive));
  }
  return scores;
}

/** A rendered page/component screenshot to benchmark in deep (vision) mode. */
export interface VisionBenchmarkTarget {
  file: string;
  component: string;
  /** See {@link BenchmarkTarget.componentType} — selects the exemplar cohort. */
  componentType?: string;
  /** Path to the rendered screenshot (PNG / JPEG / WebP). */
  image: string;
}

export interface VisionBenchmarkArgs {
  targets: VisionBenchmarkTarget[];
  exemplars: ExemplarDefinition[];
  provider: LlmProvider;
  awardBar?: Partial<AwardBarConfig>;
  responsive?: BenchmarkArgs['responsive'];
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

function formatVisionPrompt(
  target: VisionBenchmarkTarget,
  exemplars: ExemplarDefinition[]
): string {
  const exemplarSummaries = exemplars
    .map((e) =>
      [
        `--- Exemplar: ${e.name} (${e.id}) ---`,
        `URL: ${e.url}`,
        `Component type: ${e.componentType}`,
        `Why exemplar:`,
        e.whyExemplar,
        `Critique notes:`,
        e.critique,
        `Reference radar (0–100):`,
        `  philosophicalCoherence: ${e.radarReference.philosophicalCoherence}`,
        `  hierarchy:              ${e.radarReference.hierarchy}`,
        `  craftExecution:         ${e.radarReference.craftExecution}`,
        `  function:               ${e.radarReference.function}`,
        `  innovation:             ${e.radarReference.innovation}`,
      ].join('\n')
    )
    .join('\n\n');

  return [
    `Score ${target.component} (${target.file}) against the following exemplar(s) using the 5-dimension radar.`,
    '',
    exemplarSummaries,
    '',
    'The target is the RENDERED page attached as an image — judge the visual',
    'result you can see (composition, hierarchy, surface, typography, motion',
    'cues), NOT source code. Dimensions like innovation and philosophical',
    'coherence can only be honestly judged from the rendered page; score from',
    'what is shown.',
    '',
    'Score the target 0–100 on each dimension, with per-dimension',
    'confidence (high|medium|low) and a one-sentence note. Also emit a',
    'short `gaps` array — narrative observations of where the target falls',
    'short of the cited exemplar(s). Do NOT compute an overall score —',
    'the phase computes it from your dimension scores.',
    '',
    'Respond with a single fenced ```json``` block:',
    '{',
    '  "philosophicalCoherence": { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "hierarchy":              { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "craftExecution":         { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "function":               { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "innovation":             { "score": 0-100, "confidence": "high|medium|low", "notes": "..." },',
    '  "gaps": ["...", "..."]',
    '}',
  ].join('\n');
}

/**
 * Run the BENCHMARK phase in deep (vision) mode over rendered screenshots.
 * Mirrors {@link runBenchmark} but judges the *rendered page* via the
 * provider's vision channel — the difference that lets the exemplar-relative
 * award bar actually clear, since innovation / coherence / surface cannot be
 * honestly scored from source code alone. Targets with no matching exemplar
 * are skipped (BENCHMARK is opt-in per component type).
 */
export async function runVisionBenchmark(args: VisionBenchmarkArgs): Promise<BenchmarkScore[]> {
  const scores: BenchmarkScore[] = [];
  for (const target of args.targets) {
    const matched = selectExemplarsFor(target, args.exemplars);
    if (matched.length === 0) continue;
    const image = readImage(target.image);
    const prompt = formatVisionPrompt(target, matched);
    const raw = await args.provider.callVision(prompt, image);
    const parsed = parseBenchmarkResponse(raw);
    if (parsed === null) continue;
    scores.push(buildScore(target, matched, parsed, args.awardBar, args.responsive));
  }
  return scores;
}
