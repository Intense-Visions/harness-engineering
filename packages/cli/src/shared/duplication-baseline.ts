// packages/cli/src/shared/duplication-baseline.ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * A recorded duplication baseline, and the delta against it — REPORT-ONLY.
 *
 * Roadmap item `duplication-baseline-ratchet` (deferred from
 * `duplication-detection`, spec decision D4 / ADR 0134). D4 made clone
 * classes advisory, so nothing recorded whether the count was growing. This
 * module records a baseline and reports the movement against it; it NEVER
 * gates. Nothing here feeds `totalIssues`, the `--findings-json` contract or
 * an exit code, and whether a regression should ever FAIL something is left
 * as an explicit operator decision (the shard: "Must not fail-closed", #855).
 *
 * WHICH number is compared. The shard records that `classesReported` moves
 * with the repository's own source additions, so a raw count is the wrong
 * key. The baseline is instead a SET of class identities keyed on
 * `${fingerprint}:${tokenCount}` — the detector's own group key
 * (`core/src/duplication/index.ts`), which depends only on the normalized
 * token stream, never on file paths or line numbers. A class therefore keeps
 * its identity when its members move or are renamed, and the delta is
 * `added - removed` identities, not `current count - recorded count`. Each
 * entry also records `memberCount` and `rank`, so a class that GREW (gained a
 * copy) and the rank-total movement are reported too: the data an operator
 * needs to choose the ratchet key, without this module choosing it.
 *
 * Caveat carried on the wire, not hidden: the detector caps `classes` at
 * `maxClasses`. When either side was capped (`classesTruncated > 0`) a class
 * can appear "added" or "removed" only because it crossed the cap, so the
 * delta reports `capped: true`.
 */

/** Repo-relative location of the baseline. Committed, like `.harness/arch/baselines.json`. */
export const DUPLICATION_BASELINE_PATH = '.harness/duplication/baseline.json';

/** The minimum per-class shape this module reads; both CLI and MCP class shapes satisfy it. */
export interface BaselineClassLike {
  fingerprint: string;
  tokenCount: number;
  rank: number;
  memberCount: number;
}

export interface DuplicationBaselineFile {
  version: 1;
  recordedAt: string;
  /** `classesTruncated` at record time — a capped baseline is a partial set. */
  classesTruncated: number;
  classes: Record<string, { memberCount: number; rank: number }>;
}

export type DuplicationBaselineDelta =
  | {
      /** No baseline file exists. NOT a zero delta — there is nothing to compare against. */
      status: 'no-baseline';
      path: string;
    }
  | {
      /** A baseline file exists but could not be read or parsed. Also NOT a zero delta. */
      status: 'unreadable';
      path: string;
      reason: string;
    }
  | {
      status: 'compared';
      path: string;
      recordedAt: string;
      baselineClasses: number;
      currentClasses: number;
      /** `added.length - removed.length`: identity movement, not a count difference. */
      classDelta: number;
      /** Class identities (`fingerprint:tokenCount`) absent from the baseline. */
      added: string[];
      /** Baseline identities no longer reported. */
      removed: string[];
      /** Identities present on both sides whose member count increased. */
      grown: string[];
      /** Sum of `rank` now minus sum of `rank` in the baseline. */
      rankTotalDelta: number;
      /** Either side hit the `maxClasses` cap, so some movement may be cap churn. */
      capped: boolean;
    };

/** The detector's group key: content-derived, independent of file location. */
export function classIdentity(cls: { fingerprint: string; tokenCount: number }): string {
  return `${cls.fingerprint}:${cls.tokenCount}`;
}

export function buildDuplicationBaseline(
  classes: readonly BaselineClassLike[],
  classesTruncated: number,
  recordedAt: string = new Date().toISOString()
): DuplicationBaselineFile {
  const entries: DuplicationBaselineFile['classes'] = {};
  for (const cls of [...classes].sort((a, b) => classIdentity(a).localeCompare(classIdentity(b)))) {
    entries[classIdentity(cls)] = { memberCount: cls.memberCount, rank: cls.rank };
  }
  return { version: 1, recordedAt, classesTruncated, classes: entries };
}

function sumRanks(ranks: Iterable<{ rank: number }>): number {
  let total = 0;
  for (const entry of ranks) total += entry.rank;
  return total;
}

/** Pure comparison of a parsed baseline against the current classes. */
export function compareDuplicationBaseline(
  baseline: DuplicationBaselineFile,
  classes: readonly BaselineClassLike[],
  classesTruncated: number,
  baselinePath: string = DUPLICATION_BASELINE_PATH
): Extract<DuplicationBaselineDelta, { status: 'compared' }> {
  const current = new Map(classes.map((cls) => [classIdentity(cls), cls]));
  const recorded = new Map(Object.entries(baseline.classes));
  const added = [...current.keys()].filter((key) => !recorded.has(key)).sort();
  const removed = [...recorded.keys()].filter((key) => !current.has(key)).sort();
  const grown = [...current.entries()]
    .filter(([key, cls]) => {
      const before = recorded.get(key);
      return before !== undefined && cls.memberCount > before.memberCount;
    })
    .map(([key]) => key)
    .sort();
  return {
    status: 'compared',
    path: baselinePath,
    recordedAt: baseline.recordedAt,
    baselineClasses: recorded.size,
    currentClasses: current.size,
    classDelta: added.length - removed.length,
    added,
    removed,
    grown,
    rankTotalDelta: sumRanks(current.values()) - sumRanks(recorded.values()),
    capped: classesTruncated > 0 || baseline.classesTruncated > 0,
  };
}

function isBaselineFile(value: unknown): value is DuplicationBaselineFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DuplicationBaselineFile>;
  if (candidate.version !== 1 || typeof candidate.recordedAt !== 'string') return false;
  if (typeof candidate.classes !== 'object' || candidate.classes === null) return false;
  return Object.values(candidate.classes).every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.memberCount === 'number' &&
      typeof entry.rank === 'number'
  );
}

type BaselineRead =
  | { kind: 'missing' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'ok'; baseline: DuplicationBaselineFile };

export function readDuplicationBaseline(projectRoot: string): BaselineRead {
  const file = path.join(projectRoot, DUPLICATION_BASELINE_PATH);
  if (!fs.existsSync(file)) return { kind: 'missing' };
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!isBaselineFile(parsed)) {
      return { kind: 'invalid', reason: 'not a version-1 duplication baseline' };
    }
    return {
      kind: 'ok',
      baseline: { ...parsed, classesTruncated: Number(parsed.classesTruncated) || 0 },
    };
  } catch (error) {
    return { kind: 'invalid', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Read the baseline under `projectRoot` and compare. Never throws. */
export function duplicationBaselineDelta(
  projectRoot: string,
  classes: readonly BaselineClassLike[],
  classesTruncated: number
): DuplicationBaselineDelta {
  const read = readDuplicationBaseline(projectRoot);
  if (read.kind === 'missing') return { status: 'no-baseline', path: DUPLICATION_BASELINE_PATH };
  if (read.kind === 'invalid') {
    return { status: 'unreadable', path: DUPLICATION_BASELINE_PATH, reason: read.reason };
  }
  return compareDuplicationBaseline(read.baseline, classes, classesTruncated);
}

/** Write (overwrite) the baseline under `projectRoot`. Returns the absolute path written. */
export function writeDuplicationBaseline(
  projectRoot: string,
  baseline: DuplicationBaselineFile
): string {
  const file = path.join(projectRoot, DUPLICATION_BASELINE_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n');
  return file;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** One human-readable line for the CLI text report. */
export function formatDuplicationBaselineLine(delta: DuplicationBaselineDelta): string {
  if (delta.status === 'no-baseline') {
    return (
      `  vs baseline: no baseline recorded (${delta.path}); ` +
      'record one with `harness cleanup -t duplication --update-baseline`'
    );
  }
  if (delta.status === 'unreadable') {
    return `  vs baseline: baseline unreadable (${delta.path}: ${delta.reason}) — not compared`;
  }
  return (
    `  vs baseline: ${signed(delta.classDelta)} class(es) ` +
    `(${delta.added.length} new, ${delta.removed.length} gone, ${delta.grown.length} grown; ` +
    `rank total ${signed(delta.rankTotalDelta)}) since ${delta.recordedAt}` +
    (delta.capped ? ' — maxClasses cap hit, some movement may be cap churn' : '') +
    ' [advisory, never gates]'
  );
}

/** The projected duplication block both surfaces hand to {@link recordOrCompareBaseline}. */
export interface ProjectedDuplicationLike {
  classes: readonly BaselineClassLike[];
  classesTruncated: number;
}

/**
 * The single call site for both surfaces: record first when asked
 * (`--update-baseline`), then compare. Recording and then comparing yields an
 * honest zero delta against the file just written rather than a special case.
 */
export function recordOrCompareBaseline(
  projectRoot: string,
  duplication: ProjectedDuplicationLike,
  update = false
): DuplicationBaselineDelta {
  if (update) {
    writeDuplicationBaseline(
      projectRoot,
      buildDuplicationBaseline(duplication.classes, duplication.classesTruncated)
    );
  }
  return duplicationBaselineDelta(projectRoot, duplication.classes, duplication.classesTruncated);
}

/** Why `--update-baseline` was refused: there is no scan to record. */
export const UPDATE_BASELINE_WITHOUT_SCAN =
  '--update-baseline records the duplication baseline, but the duplication detector did not ' +
  'run (use `-t duplication`, or configure entropy.duplication for `-t all`). Nothing was written.';

/**
 * Compare-only entry point for a raw core `DuplicationReport` (the MCP
 * `detect_entropy` surface, which reports the delta but never writes).
 */
export function baselineDeltaForReport(
  projectRoot: string,
  report: {
    classes: ReadonlyArray<{
      fingerprint: string;
      tokenCount: number;
      rank: number;
      members: readonly unknown[];
    }>;
    stats: { classesTruncated: number };
  }
): DuplicationBaselineDelta {
  return duplicationBaselineDelta(
    projectRoot,
    report.classes.map((cls) => ({
      fingerprint: cls.fingerprint,
      tokenCount: cls.tokenCount,
      rank: cls.rank,
      memberCount: cls.members.length,
    })),
    report.stats.classesTruncated
  );
}
