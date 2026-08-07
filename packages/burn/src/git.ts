import { execFileSync } from 'node:child_process';

import type { GitSegment } from './statusline';

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Branch state for the statusline, in at most two git invocations.
 *
 * `ahead == 0` against the base means the branch is fully contained in it — the
 * work merged, so the session's context has stopped paying for itself. That is
 * the moment the /clear nudge fires.
 */
export function gitSegment(cwd: string): GitSegment | null {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') return null;
  if (branch === 'main' || branch === 'master' || branch === 'develop') {
    return { kind: 'plain', label: branch };
  }

  const ahead =
    git(cwd, ['rev-list', '--count', `origin/main..${branch}`]) ??
    git(cwd, ['rev-list', '--count', `origin/master..${branch}`]);

  if (ahead === '0') return { kind: 'merged', label: branch };
  if (ahead) return { kind: 'plain', label: `${branch} +${ahead}` };
  return { kind: 'plain', label: branch };
}
