/**
 * Per-surface rework-rate metric derived from local git history.
 *
 * Reuses the shared `scan-candidates` git walker (`readRawCommits`) and
 * `normalizeSince` — no second git walker is introduced. The module is
 * roadmap-agnostic: the planned-issue set is INJECTED (`opts.plannedIssues`), so
 * classification is deterministic in tests and core never depends on cli/roadmap
 * data resolution. Report-only: nothing here gates.
 */

import { readRawCommits, normalizeSince } from '../solutions/scan-candidates';
import type { RawCommit } from '../solutions/scan-candidates';
import { parseReferencedIssues } from '../roadmap/referenced-issues';
import { parseExternalId } from '../roadmap/external-id';
import type {
  ComputeReworkOptions,
  ReworkClassification,
  ReworkReport,
  SurfaceRework,
} from './types';

const DENOMINATOR_LABEL = 'commits touching the surface within the window';
const DEFAULT_MIN_COMMITS = 2;

/**
 * A rework commit subject: a `fix:` / `fix(scope):`, a `revert:`, or a
 * git-generated `Revert "…"`. Broader than `git-scan.ts`'s `FIX_RE` (which stays
 * untouched for `gitScan`) because rework also counts reverts.
 */
const REWORK_SUBJECT_RE = /^(fix(\([^)]+\))?:|revert:|Revert ")/i;

/**
 * Derive the planned-issue set from roadmap shard `External-ID`s
 * (`github:owner/repo#NNN` → issue number). Malformed IDs are dropped.
 */
export function plannedIssuesFromExternalIds(externalIds: string[]): Set<number> {
  const out = new Set<number>();
  for (const id of externalIds) {
    const parsed = parseExternalId(id);
    if (parsed) out.add(parsed.number);
  }
  return out;
}

/**
 * Classify a rework commit: `planned` when any issue reference parsed from its
 * subject+body is in the injected planned-issue set, else `unplanned`.
 */
export function classifyRework(
  subject: string,
  body: string,
  planned: Set<number>
): ReworkClassification {
  const refs = parseReferencedIssues(`${subject}\n${body}`);
  return refs.some((n) => planned.has(n)) ? 'planned' : 'unplanned';
}

function emptyReport(since: string, now: () => Date): ReworkReport {
  return {
    resolvedWindow: normalizeSince(since),
    denominatorLabel: DENOMINATOR_LABEL,
    totalCommitsScanned: 0,
    generatedAt: now().toISOString(),
    surfaces: [],
  };
}

/**
 * Aggregate one surface's rework counts. A commit is rework for the surface when
 * it has a fix/revert subject AND a strictly-earlier commit in the per-surface
 * list already touched it (index > 0). Callers guarantee `list` is oldest→newest.
 */
function summarizeSurface(path: string, list: RawCommit[], planned: Set<number>): SurfaceRework {
  let plannedReworkCommits = 0;
  let unplannedReworkCommits = 0;
  const reworkingShas: string[] = [];

  for (let index = 1; index < list.length; index += 1) {
    const commit = list[index];
    if (!commit || !REWORK_SUBJECT_RE.test(commit.subject)) continue;
    reworkingShas.push(commit.sha);
    if (classifyRework(commit.subject, commit.body, planned) === 'planned') {
      plannedReworkCommits += 1;
    } else {
      unplannedReworkCommits += 1;
    }
  }

  const totalCommits = list.length;
  return {
    path,
    totalCommits,
    reworkCommits: plannedReworkCommits + unplannedReworkCommits,
    plannedReworkCommits,
    unplannedReworkCommits,
    unplannedReworkRate: totalCommits === 0 ? 0 : unplannedReworkCommits / totalCommits,
    reworkingShas,
  };
}

/**
 * Compute the per-surface rework report over the lookback window. Degrade-safe:
 * a non-git dir, empty repo, or empty window yields an empty report, never a
 * throw.
 */
export async function computeRework(opts: ComputeReworkOptions): Promise<ReworkReport> {
  const now = opts.now ?? (() => new Date());
  const minCommits = opts.minCommits ?? DEFAULT_MIN_COMMITS;
  const planned = opts.plannedIssues ?? new Set<number>();

  let commits: RawCommit[];
  try {
    commits = await readRawCommits({ since: opts.since, cwd: opts.cwd });
  } catch {
    // Any unexpected git failure degrades to an empty report (report-only).
    return emptyReport(opts.since, now);
  }

  // Group commits by surface (file path), preserving oldest→newest order.
  const bySurface = new Map<string, RawCommit[]>();
  for (const commit of commits) {
    for (const file of commit.files) {
      const list = bySurface.get(file);
      if (list) list.push(commit);
      else bySurface.set(file, [commit]);
    }
  }

  const surfaces: SurfaceRework[] = [];
  for (const [path, list] of bySurface) {
    if (list.length < minCommits) continue;
    surfaces.push(summarizeSurface(path, list, planned));
  }

  surfaces.sort((a, b) => b.unplannedReworkRate - a.unplannedReworkRate);

  return {
    resolvedWindow: normalizeSince(opts.since),
    denominatorLabel: DENOMINATOR_LABEL,
    totalCommitsScanned: commits.length,
    generatedAt: now().toISOString(),
    surfaces,
  };
}
