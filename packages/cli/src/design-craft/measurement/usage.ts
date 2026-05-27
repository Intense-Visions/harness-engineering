// packages/cli/src/design-craft/measurement/usage.ts
//
// File-backed per-catalog-item counter. The "growth infrastructure" half
// of ADR 0020 (living catalog H pattern). Without measurement the seed
// rots; with it the catalog is steered by operational signal: which
// rubrics trigger most, which patterns apply most, which exemplars get
// cited most.
//
// The counter file lives under `.harness/design-craft/usage.json` so it
// is per-project, gitignorable, and easy to reset for clean tests. The
// schema is intentionally append-friendly — adding a new counter family
// later (e.g. `deferred`) does not break readers of the existing three.
//
// API:
//   recordTrigger(rubricId)   — CRITIQUE counted-up one rubric invocation
//   recordApply(patternId)    — POLISH suggested one pattern's application
//   recordCite(exemplarId)    — BENCHMARK referenced one exemplar
//   getCatalogStats()         — read-only snapshot for the dashboard / api
//   resetCatalogStats(path?)  — test helper; deletes the file
//
// Pure I/O (no LLM, no network). Safe to call from any phase. Concurrent
// writes use a read-modify-write that is correct for the single-process
// CLI surface; multi-process scenarios are out of scope for the MVP.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CatalogUsageCounters {
  rubrics: Record<string, number>;
  patterns: Record<string, number>;
  exemplars: Record<string, number>;
}

export interface CatalogStats extends CatalogUsageCounters {
  /** Wall-clock when the snapshot was read. */
  readAt: string;
  /** Total recorded events across all three counter families. */
  totalEvents: number;
}

const DEFAULT_RELATIVE_PATH = path.join('.harness', 'design-craft', 'usage.json');

function emptyCounters(): CatalogUsageCounters {
  return { rubrics: {}, patterns: {}, exemplars: {} };
}

function resolveStorePath(projectRoot?: string): string {
  const root = projectRoot ?? process.cwd();
  return path.resolve(root, DEFAULT_RELATIVE_PATH);
}

function isCounters(value: unknown): value is CatalogUsageCounters {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rubrics === 'object' &&
    v.rubrics !== null &&
    typeof v.patterns === 'object' &&
    v.patterns !== null &&
    typeof v.exemplars === 'object' &&
    v.exemplars !== null
  );
}

function readCountersFromDisk(filePath: string): CatalogUsageCounters {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isCounters(parsed)) return emptyCounters();
    return {
      rubrics: { ...(parsed.rubrics as Record<string, number>) },
      patterns: { ...(parsed.patterns as Record<string, number>) },
      exemplars: { ...(parsed.exemplars as Record<string, number>) },
    };
  } catch {
    // Missing file, unreadable file, malformed JSON — degrade to empty.
    // We never want a usage-counter read failure to break a CRITIQUE run.
    return emptyCounters();
  }
}

function writeCountersToDisk(filePath: string, counters: CatalogUsageCounters): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(counters, null, 2), 'utf8');
}

function bumpCounter(
  family: keyof CatalogUsageCounters,
  id: string,
  projectRoot?: string,
  count = 1
): void {
  if (id.length === 0 || count <= 0) return;
  const file = resolveStorePath(projectRoot);
  const counters = readCountersFromDisk(file);
  const family_record = counters[family];
  family_record[id] = (family_record[id] ?? 0) + count;
  writeCountersToDisk(file, counters);
}

/**
 * Increment the trigger counter for a rubric. Called by the CRITIQUE
 * phase once per rubric invocation, regardless of whether the rubric
 * produced a real finding or a parse-failure sentinel — we want signal
 * on rubric load and prompt-cost too, not just finding emission.
 */
export function recordTrigger(rubricId: string, projectRoot?: string): void {
  bumpCounter('rubrics', rubricId, projectRoot);
}

/**
 * Increment the apply counter for a pattern. Called by the POLISH phase
 * once per `applies: true` finding the LLM emits. Pre-filtered patterns
 * (no substring match) do NOT count — apply-rate is the load-bearing
 * signal for promoting a pattern, and ghost apps would dilute it.
 */
export function recordApply(patternId: string, projectRoot?: string): void {
  bumpCounter('patterns', patternId, projectRoot);
}

/**
 * Increment the cite counter for an exemplar. Called by the BENCHMARK
 * phase per exemplar id referenced in the LLM prompt — citation, not
 * judgment-output, is the load-bearing signal. A poorly-scoring target
 * still "cites" the exemplar that anchors the comparison.
 */
export function recordCite(exemplarId: string, projectRoot?: string): void {
  bumpCounter('exemplars', exemplarId, projectRoot);
}

/** Read a coherent snapshot of all three counter families. */
export function getCatalogStats(projectRoot?: string): CatalogStats {
  const file = resolveStorePath(projectRoot);
  const counters = readCountersFromDisk(file);
  const totalEvents =
    sumValues(counters.rubrics) + sumValues(counters.patterns) + sumValues(counters.exemplars);
  return {
    ...counters,
    readAt: new Date().toISOString(),
    totalEvents,
  };
}

/**
 * Delete the usage file. Test helper — production code should not call
 * this. Idempotent: missing file is a no-op.
 */
export function resetCatalogStats(projectRoot?: string): void {
  const file = resolveStorePath(projectRoot);
  try {
    fs.unlinkSync(file);
  } catch {
    /* nothing to clean */
  }
}

function sumValues(record: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(record)) total += v;
  return total;
}
