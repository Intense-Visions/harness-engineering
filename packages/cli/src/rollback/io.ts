import { execFileSync } from 'node:child_process';
import type { RollbackIO, ResolvedTarget, LaterMerge } from '@harness-engineering/core';

/** Trimmed stdout of `git <args>` (no shell — args are an array). */
const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf-8' }).toString();

/**
 * Injectable git seam for the (otherwise process-bound) dry-run logic. `run`
 * throws on any non-zero exit (like `execFileSync`); `tryMergeTree` is exit-code
 * aware and returns the raw status + stdout so the caller can distinguish a
 * CONFLICT (exit 1) from a real ERROR (exit 128, e.g. a bad/missing object).
 */
export interface GitSeam {
  run(args: string[]): string;
  tryMergeTree(args: string[]): { status: number; stdout: string };
}

/** Real git seam backing `computeRevertDryRun` via `execFileSync` (no shell). */
const nodeGitSeam: GitSeam = {
  run: (args) => git(args).trim(),
  tryMergeTree: (args) => {
    try {
      const stdout = execFileSync('git', args, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
      return { status: 0, stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: Buffer | string };
      return { status: e?.status ?? 1, stdout: e?.stdout?.toString?.() ?? '' };
    }
  },
};

/** Trimmed stdout of `gh <args>` (no shell). */
const gh = (args: string[]): string => execFileSync('gh', args, { encoding: 'utf-8' }).toString();

/**
 * Parse `git merge-tree --write-tree` output. On CLEAN merges git prints only the
 * result tree OID. On CONFLICT it exits non-zero and prints:
 *   <tree-oid>\n
 *   <conflicted file info: "<mode> <oid> <stage>\t<path>" lines>\n
 *   \n
 *   <informational "CONFLICT ..." messages>
 * We recover the conflicted paths from the stage-entry block (deduped).
 */
function parseConflictPaths(stdout: string): string[] {
  const lines = stdout.split('\n');
  const paths = new Set<string>();
  // Skip line 0 (tree OID). Collect stage entries until the first blank line.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') break;
    // "<mode> <oid> <stage>\t<path>"
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const path = line.slice(tab + 1).trim();
    if (path) paths.add(path);
  }
  return [...paths];
}

/**
 * Compute the revert of a commit as an in-memory 3-way merge via
 * `git merge-tree --write-tree` (base = the commit, ours = HEAD, theirs = the
 * commit's parent). This inverts the commit's changes onto HEAD purely in the
 * object database — it touches NEITHER the working tree NOR the index.
 *
 * Parent selection (#3b): a real 2+-parent merge commit inverts relative to its
 * FIRST parent (the `-m 1` mainline); a squash/rebase merge is a single-parent
 * commit and inverts relative to its SOLE parent. We read the parent list from
 * `rev-list --parents` and pick parent 1 either way (correct for both shapes),
 * guarding the degenerate zero-parent (root) commit.
 *
 * Exit-code discipline (#1): `git merge-tree --write-tree` exits 0 on a CLEAN
 * merge, 1 on CONFLICT, and anything else (e.g. 128 for a bad/missing object) on
 * a real ERROR. Only exit 1 is treated as a conflict; any other non-zero status
 * re-throws so a transient/bad-SHA failure is never misclassified as a skip.
 */
export async function computeRevertDryRun(
  mergeSha: string,
  gitSeam: GitSeam = nodeGitSeam
): Promise<{ clean: boolean; conflictPaths: string[] }> {
  // "<commit> <parent1> [<parent2> ...]" — the commit's own sha is element 0.
  const revList = gitSeam.run(['rev-list', '--parents', '-n', '1', mergeSha]);
  const parents = revList.trim().split(/\s+/).slice(1);
  if (parents.length === 0) {
    throw new Error(`cannot revert ${mergeSha}: commit has no parent (root commit)`);
  }
  // First (mainline) parent for merges; sole parent for squash/rebase commits.
  const parent = parents[0]!;

  const { status, stdout } = gitSeam.tryMergeTree([
    'merge-tree',
    '--write-tree',
    '--merge-base',
    mergeSha,
    'HEAD',
    parent,
  ]);
  if (status === 0) return { clean: true, conflictPaths: [] };
  if (status === 1) return { clean: false, conflictPaths: parseConflictPaths(stdout) };
  // Any other non-zero status is a real error (bad object, transient failure) —
  // re-throw rather than silently reporting a (falsely empty) conflict.
  throw new Error(
    `git merge-tree failed for ${mergeSha} (exit ${status})${stdout ? `: ${stdout.trim()}` : ''}`
  );
}

/** Process-bound `revertDryRun` used by the real RollbackIO adapter. */
async function revertDryRun(
  mergeSha: string
): Promise<{ clean: boolean; conflictPaths: string[] }> {
  return computeRevertDryRun(mergeSha, nodeGitSeam);
}

/** Resolve a merged PR to its merge commit, changed files, and title via `gh`. */
async function resolveTarget(pr: number): Promise<ResolvedTarget> {
  const raw = gh(['pr', 'view', String(pr), '--json', 'mergeCommit,files,title']);
  const parsed = JSON.parse(raw) as {
    mergeCommit: { oid: string } | null;
    files: { path: string }[];
    title: string;
  };
  return {
    mergeSha: parsed.mergeCommit?.oid ?? '',
    changedFiles: (parsed.files ?? []).map((f) => f.path),
    title: parsed.title ?? `PR #${pr}`,
  };
}

/** PRs merged after the target (by mergedAt), with their changed-file sets. */
async function listLaterMerges(pr: number): Promise<LaterMerge[]> {
  // The target's mergedAt bounds "later"; fetch merged PRs and filter client-side.
  const targetRaw = gh(['pr', 'view', String(pr), '--json', 'mergedAt']);
  const targetMergedAt = (JSON.parse(targetRaw) as { mergedAt: string | null }).mergedAt;
  if (!targetMergedAt) return [];
  const raw = gh([
    'pr',
    'list',
    '--state',
    'merged',
    '--limit',
    '100',
    '--json',
    'number,files,mergedAt',
  ]);
  const list = JSON.parse(raw) as {
    number: number;
    files: { path: string }[];
    mergedAt: string;
  }[];
  return list
    .filter((p) => p.number !== pr && p.mergedAt > targetMergedAt)
    .map((p) => ({ pr: p.number, changedFiles: (p.files ?? []).map((f) => f.path) }));
}

/**
 * Real RollbackIO binding git/gh via `execFileSync` (no shell). Untested-by-design:
 * all branching logic lives in the pure classifier/composer that ARE tested; this
 * adapter is a thin process seam exercised only through the fake in command tests.
 */
export function createNodeRollbackIO(): RollbackIO {
  return { revertDryRun, resolveTarget, listLaterMerges };
}
