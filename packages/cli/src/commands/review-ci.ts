import { execFileSync } from 'node:child_process';
import { parseDiff } from '@harness-engineering/core';
import type { DiffInfo } from '@harness-engineering/core';

/**
 * Injectable git seam. Returns trimmed stdout of `git <args>`.
 * Real implementation uses `execFileSync` (no shell) so callers cannot inject
 * shell metacharacters and tests can stub it without spawning a process.
 */
export type RunGit = (args: string[]) => string;

const defaultRunGit: RunGit = (args) =>
  execFileSync('git', args, { encoding: 'utf-8' }).toString().trim();

/**
 * Resolve the git range to diff for the review.
 *
 * - If an explicit `range` is provided, it is used verbatim.
 * - Otherwise the base branch is resolved from `origin/HEAD`
 *   (`git symbolic-ref refs/remotes/origin/HEAD`), defaulting to `main`
 *   when the symbolic ref is absent (e.g. some CI checkouts) — in which
 *   case the caller can pass `--diff` explicitly.
 */
export function resolveDiffRange(opts: { range?: string; cwd?: string; runGit?: RunGit }): string {
  if (opts.range) return opts.range;
  const runGit = opts.runGit ?? defaultRunGit;
  let base = 'main';
  try {
    const ref = runGit(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const m = ref.match(/origin\/(.+)$/);
    if (m?.[1]) base = m[1];
  } catch {
    // No origin/HEAD symbolic ref — fall back to main.
  }
  return `origin/${base}...HEAD`;
}

/**
 * Split a raw unified diff into per-file sections keyed by the (new) path.
 *
 * `parseDiff` returns `ChangedFile` metadata (path/status/counts) but NOT the
 * per-file diff text, while core's CI orchestrator reconstructs the STDIN diff
 * via `Array.from(diff.fileDiffs.values()).join('\n')`. So we must populate
 * `fileDiffs` with real per-file content (not empty strings) or the LLM tier
 * would receive an empty diff. Sections are delimited by `diff --git` headers.
 */
function splitDiffByFile(rawDiff: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headerRe = /^diff --git a\/.+ b\/(.+)$/;
  let currentPath: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentPath !== null) sections.set(currentPath, buffer.join('\n'));
  };
  for (const line of rawDiff.split('\n')) {
    const m = line.match(headerRe);
    if (m?.[1]) {
      flush();
      currentPath = m[1];
      buffer = [line];
    } else if (currentPath !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Build a core {@link DiffInfo} from a raw unified-diff string by reusing core's
 * `parseDiff` for file metadata and splitting the raw diff for per-file content.
 */
export function buildDiffInfo(rawDiff: string): DiffInfo {
  const parsed = parseDiff(rawDiff);
  if (!parsed.ok) throw new Error(`Failed to parse diff: ${parsed.error.message}`);
  const files = parsed.value.files;
  const perFile = splitDiffByFile(rawDiff);
  return {
    changedFiles: files.map((f) => f.path),
    newFiles: files.filter((f) => f.status === 'added').map((f) => f.path),
    deletedFiles: files.filter((f) => f.status === 'deleted').map((f) => f.path),
    totalDiffLines: rawDiff.split('\n').length,
    fileDiffs: new Map(files.map((f) => [f.path, perFile.get(f.path) ?? rawDiff])),
  };
}
