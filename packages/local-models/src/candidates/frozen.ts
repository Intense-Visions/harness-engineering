/**
 * Frozen candidate snapshot loader (LMLM Phase 2, D3/D8).
 *
 * The bundled `candidates.json` is imported statically so esbuild (tsup)
 * inlines it into the package output — no runtime file I/O, works offline,
 * and stays deterministic. This mirrors the benchmark snapshot loader
 * (`ranker/benchmarks/snapshot.ts`). Regenerate the JSON on demand with
 * `scripts/refresh-model-candidates.mjs`; never auto-commit it from CI (D5).
 *
 * @see docs/changes/lmlm-functional-wiring/proposal.md (Phase 2, D5)
 */

import bundledCandidates from './candidates.json' with { type: 'json' };
import { normalizeQuantId } from '../ranker/index.js';
import type { FrozenCandidate, FrozenCandidatesFile, LoadFrozenCandidatesResult } from './types.js';

/** Current supported schema version of the frozen candidate file. */
export const FROZEN_CANDIDATES_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validate one raw entry into a `FrozenCandidate`, or return a reason string. */
function validateCandidate(raw: unknown, index: number): FrozenCandidate | string {
  if (!isRecord(raw)) return `candidate[${index}] is not an object`;
  if (typeof raw.hfRepoId !== 'string' || raw.hfRepoId.length === 0) {
    return `candidate[${index}] has no hfRepoId`;
  }
  if (typeof raw.sizeB !== 'number' || !Number.isFinite(raw.sizeB) || raw.sizeB <= 0) {
    return `candidate[${index}] (${raw.hfRepoId}) has invalid sizeB`;
  }
  if (typeof raw.quant !== 'string' || !normalizeQuantId(raw.quant).known) {
    return `candidate[${index}] (${raw.hfRepoId}) has unrecognised quant '${String(raw.quant)}'`;
  }
  const candidate: FrozenCandidate = {
    hfRepoId: raw.hfRepoId,
    sizeB: raw.sizeB,
    quant: normalizeQuantId(raw.quant).canonical,
  };
  if (typeof raw.activeB === 'number' && raw.activeB > 0) candidate.activeB = raw.activeB;
  if (typeof raw.ollamaName === 'string' && raw.ollamaName.length > 0) {
    candidate.ollamaName = raw.ollamaName;
  }
  if (typeof raw.family === 'string' && raw.family.length > 0) candidate.family = raw.family;
  return candidate;
}

/** Validate a raw frozen-candidates document. Returns candidates or a reason. */
export function validateFrozenCandidates(
  data: unknown
): { ok: true; candidates: FrozenCandidate[] } | { ok: false; reason: string } {
  if (!isRecord(data)) return { ok: false, reason: 'frozen candidates file is not an object' };
  if (data.version !== FROZEN_CANDIDATES_VERSION) {
    return { ok: false, reason: `unsupported version ${String(data.version)}` };
  }
  if (!Array.isArray(data.candidates)) {
    return { ok: false, reason: 'frozen candidates file has no candidates array' };
  }
  const candidates: FrozenCandidate[] = [];
  for (let i = 0; i < data.candidates.length; i++) {
    const result = validateCandidate(data.candidates[i], i);
    if (typeof result === 'string') return { ok: false, reason: result };
    candidates.push(result);
  }
  return { ok: true, candidates };
}

/**
 * Load the bundled frozen candidate snapshot. Degradation-first: a
 * schema-invalid snapshot returns an empty list plus a warning (never throws),
 * so the recommender surfaces "no recommendations" rather than crashing.
 * Tests inject `override` to exercise the fallback path.
 */
export function loadFrozenCandidates(override?: unknown): LoadFrozenCandidatesResult {
  const data: unknown = override ?? (bundledCandidates as FrozenCandidatesFile);
  const validation = validateFrozenCandidates(data);
  if (!validation.ok) {
    return { candidates: [], source: 'fallback', warnings: [validation.reason] };
  }
  return { candidates: validation.candidates, source: 'frozen', warnings: [] };
}
