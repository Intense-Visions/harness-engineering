import { spawnSync } from 'node:child_process';

import type { ProvenanceEntry } from './provenance';

/** Outcome of resolving one provenance entry's issues to merged PRs. */
export interface LinkResult {
  /** Distinct merged PR numbers linked to this entry's issues. */
  mergedPrs: number[];
  /**
   * Whether the linkage query actually ran and was understood. `false` means
   * `gh` was missing, errored, or returned unparseable output — the entry is
   * then treated as unlinked, never as "zero merged PRs" (which would read as a
   * lane that shipped nothing rather than one we could not measure).
   */
  ok: boolean;
}

/** A single invocation of the `gh` CLI. Injected in tests; real spawn by default. */
export type GhRunner = (args: string[]) => { status: number; stdout: string };

export interface LinkOptions {
  runGh?: GhRunner;
}

/**
 * Default `gh` runner: spawn the real CLI, tolerating its absence.
 *
 * `GITHUB_TOKEN` is stripped from the child env because in this repo a
 * keyring-backed `gh` auth is what works; an inherited `GITHUB_TOKEN` shadows
 * it. A missing binary (ENOENT) surfaces as a non-zero status rather than an
 * exception, so a machine without `gh` degrades to unlinked instead of crashing
 * the report.
 */
export function defaultGhRunner(args: string[]): { status: number; stdout: string } {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  const res = spawnSync('gh', args, { encoding: 'utf8', env });
  if (res.error) return { status: 1, stdout: '' };
  return { status: res.status ?? 1, stdout: res.stdout ?? '' };
}

/**
 * The merged PRs for a single issue via `gh`.
 *
 * `gh issue view <n> --json closedByPullRequestsReferences` returns the PRs
 * that reference/close the issue; we keep only those whose state is MERGED.
 * Any failure (missing `gh`, non-zero exit, JSON we cannot read) yields a
 * `null` — the caller then marks the whole entry unlinked.
 */
function mergedPrsForIssue(issue: number, runGh: GhRunner): number[] | null {
  const res = runGh(['issue', 'view', String(issue), '--json', 'closedByPullRequestsReferences']);
  if (res.status !== 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    return null;
  }
  const refs = (parsed as { closedByPullRequestsReferences?: unknown })
    ?.closedByPullRequestsReferences;
  if (!Array.isArray(refs)) return null;
  const merged: number[] = [];
  for (const ref of refs) {
    const r = ref as { number?: unknown; state?: unknown };
    if (typeof r.number === 'number' && r.state === 'MERGED') merged.push(r.number);
  }
  return merged;
}

/**
 * Resolve every provenance entry's issues to the merged PR numbers they closed.
 *
 * The map is keyed by entry slug. An entry with no issues, or one whose every
 * issue query failed, is `{ mergedPrs: [], ok: false }`. An entry where at
 * least one issue resolved is `ok: true` with the de-duped union of merged PR
 * numbers — a single PR closing two issues counts once.
 */
export function linkPrs(
  entries: ProvenanceEntry[],
  options: LinkOptions = {}
): Map<string, LinkResult> {
  const runGh = options.runGh ?? defaultGhRunner;
  const out = new Map<string, LinkResult>();

  for (const entry of entries) {
    if (entry.issues.length === 0) {
      out.set(entry.slug, { mergedPrs: [], ok: false });
      continue;
    }
    const prs = new Set<number>();
    let anyOk = false;
    for (const issue of entry.issues) {
      const merged = mergedPrsForIssue(issue, runGh);
      if (merged === null) continue;
      anyOk = true;
      for (const pr of merged) prs.add(pr);
    }
    out.set(entry.slug, { mergedPrs: [...prs], ok: anyOk });
  }
  return out;
}
