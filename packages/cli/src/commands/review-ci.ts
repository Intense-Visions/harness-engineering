import { execFileSync } from 'node:child_process';

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
