import { spawnSync } from 'node:child_process';

/**
 * Runs a `git` subcommand. Throws on failure (non-zero exit or spawn error) so
 * `configureMergeOursDriver` can treat git-unavailable / not-a-repo uniformly.
 */
export type GitRunner = (args: string[]) => void;

/** Default runner: synchronous `git <args>` in `cwd`, output suppressed. */
export function defaultGitRunner(cwd: string): GitRunner {
  return (args: string[]) => {
    const res = spawnSync('git', args, { cwd, stdio: 'ignore' });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      throw new Error(`git ${args.join(' ')} exited with status ${res.status ?? 'null'}`);
    }
  };
}

export interface MergeDriverSetupResult {
  /** True when `merge.ours.driver` was set successfully. */
  configured: boolean;
  /** Non-fatal warning message when configuration was skipped. */
  warning?: string;
}

/**
 * Configure the `ours` merge driver for this clone so that `merge=ours`
 * `.gitattributes` entries (e.g. the generated `docs/roadmap.md` aggregate)
 * actually take effect on merge.
 *
 * Never throws: if git is unavailable or `cwd` is not a git repo, it resolves
 * with `{ configured: false, warning }` so callers (notably `harness init`)
 * can warn and continue without failing.
 */
export async function configureMergeOursDriver(
  cwd: string,
  runner: GitRunner = defaultGitRunner(cwd)
): Promise<MergeDriverSetupResult> {
  try {
    runner(['config', 'merge.ours.driver', 'true']);
    return { configured: true };
  } catch {
    return {
      configured: false,
      warning:
        'Could not configure git merge.ours.driver (git unavailable or not a repo). ' +
        'Generated-file merges (merge=ours) will be inert until you run: ' +
        'git config merge.ours.driver true',
    };
  }
}

/** The git merge-driver command for `merge=comprehension` `.gitattributes` entries. */
export const COMPREHENSION_MERGE_DRIVER_COMMAND = 'harness comprehension-merge-driver %O %A %B %P';

/**
 * Configure the `comprehension` merge driver for this clone (ADR 0109 slice 5) so
 * that the `_module.md merge=comprehension` `.gitattributes` entry takes effect.
 *
 * The driver resolves a shard conflict by REGENERATING the shard from the merged
 * working-tree source — sound because a comprehension unit is a pure function of
 * its source (ADR 0108/0109), so it never needs a hand-merge. Combined with the
 * byte-stable shards of slice 1 (same source ⇒ identical shard ⇒ no conflict), the
 * developer never resolves a comprehension merge marker.
 *
 * Never throws: if git is unavailable or `cwd` is not a git repo, resolves with
 * `{ configured: false, warning }` so `harness init` can warn and continue.
 */
export async function configureComprehensionMergeDriver(
  cwd: string,
  runner: GitRunner = defaultGitRunner(cwd)
): Promise<MergeDriverSetupResult> {
  try {
    runner(['config', 'merge.comprehension.driver', COMPREHENSION_MERGE_DRIVER_COMMAND]);
    return { configured: true };
  } catch {
    return {
      configured: false,
      warning:
        'Could not configure git merge.comprehension.driver (git unavailable or not a repo). ' +
        'Comprehension shard conflicts (merge=comprehension) will fall back to a plain text ' +
        `merge until you run: git config merge.comprehension.driver '${COMPREHENSION_MERGE_DRIVER_COMMAND}'`,
    };
  }
}
