import { execFileSync } from 'node:child_process';
import type { RollbackIO, ResolvedTarget, LaterMerge } from '@harness-engineering/core';

/** Trimmed stdout of `git <args>` (no shell — args are an array). */
const git = (args: string[]): string => execFileSync('git', args, { encoding: 'utf-8' }).toString();

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
 * Compute the revert of a merge commit as an in-memory 3-way merge via
 * `git merge-tree --write-tree` (base = the merge commit, ours = HEAD,
 * theirs = its first parent). This inverts the merge's changes onto HEAD purely
 * in the object database — it touches NEITHER the working tree NOR the index
 * (verified: `git status` stays clean). A non-zero exit signals conflicts, whose
 * paths are recovered from the machine-readable conflicted-file block.
 */
async function revertDryRun(
  mergeSha: string
): Promise<{ clean: boolean; conflictPaths: string[] }> {
  // `revert -m 1` inverts changes relative to parent 1, i.e. a 3-way merge
  // with base=<merge>, ours=HEAD, theirs=<parent1>.
  const parent1 = git(['rev-parse', `${mergeSha}^1`]).trim();
  try {
    execFileSync('git', ['merge-tree', '--write-tree', '--merge-base', mergeSha, 'HEAD', parent1], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { clean: true, conflictPaths: [] };
  } catch (err) {
    // Non-zero exit == conflict. stdout carries the conflicted-file block.
    const stdout = (err as { stdout?: Buffer | string })?.stdout?.toString?.() ?? '';
    return { clean: false, conflictPaths: parseConflictPaths(stdout) };
  }
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
