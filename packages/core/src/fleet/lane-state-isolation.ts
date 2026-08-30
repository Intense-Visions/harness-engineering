// packages/core/src/fleet/lane-state-isolation.ts
//
// Per-lane user-global state isolation (issue #1299, ADR 0098).
//
// A `-fleet` build lane runs in its own git worktree so its REPO writes cannot
// collide with a sibling lane. But a git worktree isolates exactly one thing:
// the repository working tree. It does NOT isolate the process's `$HOME` or
// `~/.claude/`: a lane whose feature — or whose VERIFICATION run — exercises a
// user-global writer writes straight through the worktree boundary to the
// operator's real, live state. (#1299: a `roadmap-fleet` lane's `burn`
// verification rewrote the operator's live `~/.claude/hud/state/summary.json`.)
//
// The fix is a per-lane CONFIG-DIR ENV OVERRIDE. Redirect the `~/.claude` config
// dir into a sandbox under the lane's own worktree by setting `CLAUDE_CONFIG_DIR`
// in the environment the lane and its child processes inherit. Every writer that
// keys off `CLAUDE_CONFIG_DIR` — Claude Code itself, and the harness
// state-writers taught to honor it (see `packages/burn/src/config.ts`) — then
// lands inside the lane's sandbox instead of the operator's home. One generic
// override isolates every such writer at once, rather than teaching each writer
// about workspaces one at a time (ADR 0098 §2; the rejected per-tool alternative
// re-opens the hole every time a new user-global writer is added).
//
// Pure: computes paths and an env delta. Performs no I/O and mutates nothing.

import path from 'node:path';

/**
 * Directory name (under a worktree's gitignored `.harness/`) that holds a lane's
 * sandboxed user-global state. Placing the sandbox under `.harness/` keeps it out
 * of the lane's tracked tree, so it never dirties `git status` nor trips the
 * whole-tree pre-push gates the fleet depends on.
 */
export const LANE_STATE_DIRNAME = 'lane-state';

/** Resolve the per-lane state sandbox root for a worktree. */
export function resolveLaneStateDir(worktreePath: string): string {
  return path.join(worktreePath, '.harness', LANE_STATE_DIRNAME);
}

/**
 * Resolve the per-lane `CLAUDE_CONFIG_DIR` — the sandboxed `~/.claude` equivalent
 * a lane redirects its user-global config/state into.
 */
export function resolveLaneClaudeConfigDir(worktreePath: string): string {
  return path.join(resolveLaneStateDir(worktreePath), '.claude');
}

/** The env-var overrides that redirect a lane's user-global state into its sandbox. */
export interface LaneStateEnvOverride {
  /** Claude Code's config-dir relocation var — moves `~/.claude` for the lane. */
  CLAUDE_CONFIG_DIR: string;
}

/**
 * Build the per-lane env override that redirects user-global (`~/.claude`) state
 * into the lane's worktree sandbox. Merge it into the environment a lane and its
 * child processes inherit — see {@link applyLaneStateEnv}.
 */
export function buildLaneStateEnvOverride(worktreePath: string): LaneStateEnvOverride {
  return { CLAUDE_CONFIG_DIR: resolveLaneClaudeConfigDir(worktreePath) };
}

/**
 * Apply the per-lane state override on top of a base environment, returning a
 * NEW env (the base is never mutated).
 *
 * The lane override WINS over any inherited `CLAUDE_CONFIG_DIR`: each lane must
 * get its OWN sandbox even when the parent process already relocated its config
 * dir, otherwise two concurrent lanes would share one store — the very
 * interference the worktree exists to prevent.
 */
export function applyLaneStateEnv(
  base: NodeJS.ProcessEnv,
  worktreePath: string
): NodeJS.ProcessEnv {
  return { ...base, ...buildLaneStateEnvOverride(worktreePath) };
}
