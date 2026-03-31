// packages/core/src/state/checkpoint-commit.ts
import { execFileSync } from 'child_process';

export interface CheckpointCommitOptions {
  projectPath: string;
  session: string;
  checkpointLabel: string;
  isRecovery?: boolean;
}

export interface CommitResult {
  committed: boolean;
  sha?: string;
  message: string;
}

/**
 * Commit all changes at a checkpoint boundary.
 *
 * 1. git add -A (within project path)
 * 2. git status — if nothing staged, skip
 * 3. git commit with message: "[autopilot] <checkpointLabel>"
 *    Recovery commits: "[autopilot][recovery] <checkpointLabel>"
 *
 * Returns { committed: boolean, sha?: string, message: string }
 */
export async function commitAtCheckpoint(opts: CheckpointCommitOptions): Promise<CommitResult> {
  const { projectPath, checkpointLabel, isRecovery } = opts;
  const execOpts = { cwd: projectPath, encoding: 'utf-8' as const };

  // Stage all changes
  execFileSync('git', ['add', '-A'], execOpts);

  // Check if there are staged changes
  const status = execFileSync('git', ['status', '--porcelain'], execOpts).trim();
  if (status === '') {
    return { committed: false, message: 'Nothing to commit' };
  }

  // Build commit message
  const prefix = isRecovery ? '[autopilot][recovery]' : '[autopilot]';
  const message = `${prefix} ${checkpointLabel}`;

  // Commit
  execFileSync('git', ['commit', '-m', message], execOpts);

  // Get the SHA of the new commit
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], execOpts).trim();

  return { committed: true, sha, message };
}
