import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LANE_STATE_DIRNAME,
  applyLaneStateEnv,
  buildLaneStateEnvOverride,
  resolveLaneClaudeConfigDir,
  resolveLaneStateDir,
} from './lane-state-isolation';

describe('lane-state-isolation (#1299 / ADR 0098)', () => {
  const worktree = path.join(path.sep, 'tmp', 'wt', 'lane-42');

  it('places the sandbox under the worktree gitignored .harness dir', () => {
    expect(resolveLaneStateDir(worktree)).toBe(path.join(worktree, '.harness', LANE_STATE_DIRNAME));
  });

  it('resolves the per-lane CLAUDE_CONFIG_DIR inside the sandbox', () => {
    expect(resolveLaneClaudeConfigDir(worktree)).toBe(
      path.join(worktree, '.harness', LANE_STATE_DIRNAME, '.claude')
    );
  });

  it('builds an override that redirects CLAUDE_CONFIG_DIR into the lane', () => {
    const override = buildLaneStateEnvOverride(worktree);
    expect(override).toEqual({ CLAUDE_CONFIG_DIR: resolveLaneClaudeConfigDir(worktree) });
    expect(override.CLAUDE_CONFIG_DIR.startsWith(worktree)).toBe(true);
  });

  it('applies the override without mutating the base env, and wins over an inherited value', () => {
    const base: NodeJS.ProcessEnv = {
      HOME: '/Users/operator',
      CLAUDE_CONFIG_DIR: '/Users/operator/.claude', // the operator's real store
    };
    const applied = applyLaneStateEnv(base, worktree);

    // base is untouched (pure)
    expect(base.CLAUDE_CONFIG_DIR).toBe('/Users/operator/.claude');
    // the lane override wins so each lane gets its OWN sandbox
    expect(applied.CLAUDE_CONFIG_DIR).toBe(resolveLaneClaudeConfigDir(worktree));
    expect(applied.HOME).toBe('/Users/operator');
  });

  it('gives two different worktrees two disjoint sandboxes', () => {
    const a = buildLaneStateEnvOverride(path.join(path.sep, 'tmp', 'wt', 'lane-a'));
    const b = buildLaneStateEnvOverride(path.join(path.sep, 'tmp', 'wt', 'lane-b'));
    expect(a.CLAUDE_CONFIG_DIR).not.toBe(b.CLAUDE_CONFIG_DIR);
  });
});
