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
