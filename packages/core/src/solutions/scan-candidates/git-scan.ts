import { readRawCommits } from './read-commits';

// normalizeSince lives in its own leaf module so read-commits.ts and hotspot.ts
// can use it without importing git-scan.ts, which imports read-commits.ts — that
// was a real import cycle (surfaced by the circular-deps collector, #2235).
export { normalizeSince } from './normalize-since';

export interface GitScanOptions {
  since: string; // e.g. '7d', '30d' — passed to git --since=
  cwd: string;
}

export interface ScannedCommit {
  sha: string;
  subject: string;
  filesChanged: number;
  /**
   * Heuristic proxy for "branches that took multiple iterations". For v1: count
   * of commits in the lookback window whose changed file set overlaps this
   * commit's. Higher value implies repeated work in the same area.
   */
  branchIterations: number;
}

const FIX_RE = /^fix(\([^)]+\))?:/i;

export async function gitScan(opts: GitScanOptions): Promise<ScannedCommit[]> {
  // Single shared git walker (read-commits.ts). gitScan ignores the commit body.
  // The reader returns oldest→newest; gitScan historically reports newest→oldest
  // (git's native log order), so reverse back to preserve that contract.
  const all = (await readRawCommits({ since: opts.since, cwd: opts.cwd })).reverse();
  const fixes = all.filter((c) => FIX_RE.test(c.subject));

  // branchIterations: for each fix commit, count other commits in the window
  // touching at least one of the same files.
  return fixes.map((c) => {
    const overlap = all.filter(
      (other) => other.sha !== c.sha && other.files.some((f) => c.files.includes(f))
    ).length;
    return {
      sha: c.sha,
      subject: c.subject,
      filesChanged: c.files.length,
      branchIterations: overlap,
    };
  });
}
