/**
 * Regression: a `-fleet` build lane must not write the HUD store through the
 * worktree isolation boundary to the operator's real `~/.claude/hud/` (#1299).
 *
 * A lane redirects user-global state by setting a per-lane `CLAUDE_CONFIG_DIR`
 * (ADR 0098). `resolvePaths()` must honor that override so every HUD path lands
 * inside the lane's sandbox instead of `$HOME/.claude`.
 *
 * BEFORE the fix `resolvePaths()` keyed the HUD base off `$HOME` alone and
 * ignored `CLAUDE_CONFIG_DIR`, so a lane's verification run wrote straight to
 * the operator's live `~/.claude/hud/state/summary.json` — the exact incident
 * that opened #1299. The "redirects ... into a per-lane CLAUDE_CONFIG_DIR" case
 * below fails before the fix and passes after.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolvePaths } from '../src/config';

// The per-lane sandbox path @harness-engineering/core's
// `resolveLaneClaudeConfigDir()` produces for a worktree. Inlined (not imported)
// because `@harness-engineering/burn` is deliberately dependency-free; this test
// asserts only burn-local behavior — that `resolvePaths()` honors whatever
// `CLAUDE_CONFIG_DIR` a lane hands it.
function laneClaudeConfigDir(worktree: string): string {
  return path.join(worktree, '.harness', 'lane-state', '.claude');
}

describe('burn HUD path resolution — per-lane state isolation (#1299)', () => {
  const realHome = path.join(path.sep, 'Users', 'operator');

  it('falls back to $HOME/.claude when no CLAUDE_CONFIG_DIR is set', () => {
    const paths = resolvePaths({ HOME: realHome });
    expect(paths.summary).toBe(path.join(realHome, '.claude', 'hud', 'state', 'summary.json'));
  });

  it('redirects the HUD store into a per-lane CLAUDE_CONFIG_DIR (isolation boundary)', () => {
    // A lane sandbox under its own (gitignored) worktree `.harness/` dir.
    const worktree = path.join(path.sep, 'tmp', 'lane-worktree-abc');
    const laneConfigDir = laneClaudeConfigDir(worktree);

    const paths = resolvePaths({ HOME: realHome, CLAUDE_CONFIG_DIR: laneConfigDir });

    // Every HUD artifact must land inside the lane sandbox ...
    expect(paths.hud).toBe(path.join(laneConfigDir, 'hud'));
    expect(paths.state).toBe(path.join(laneConfigDir, 'hud', 'state'));
    expect(paths.summary).toBe(path.join(laneConfigDir, 'hud', 'state', 'summary.json'));
    expect(paths.projects).toBe(path.join(laneConfigDir, 'projects'));
    expect(paths.config).toBe(path.join(laneConfigDir, 'hud', 'config.json'));

    // ... and NONE of it may touch the operator's real home.
    for (const p of Object.values(paths)) {
      expect(p.startsWith(path.join(realHome, '.claude'))).toBe(false);
    }
    expect(paths.summary.startsWith(worktree)).toBe(true);
  });

  it('still lets explicit CLAUDE_HUD_* vars win over the derived base', () => {
    const explicitState = path.join(path.sep, 'tmp', 'explicit-state');
    const paths = resolvePaths({
      HOME: realHome,
      CLAUDE_CONFIG_DIR: path.join(path.sep, 'tmp', 'lane', '.claude'),
      CLAUDE_HUD_STATE: explicitState,
    });
    expect(paths.state).toBe(explicitState);
    expect(paths.summary).toBe(path.join(explicitState, 'summary.json'));
  });
});
