// packages/cli/tests/hooks/pre-commit-dogfood-managed-block.test.ts
//
// Dogfooding invariant (#1079): this repo's own `.husky/pre-commit` roadmap-regen
// step MUST be the verbatim output of the adopter-facing installer
// (`harness roadmap install-hook`), so the two implementations of the same logic
// share ONE source of truth (buildRegenBlock) and can never drift.
//
// Before #1079 the hook carried a hand-maintained bespoke regen block that a
// change to buildRegenBlock would silently diverge from. This test fails if:
//   - the managed markers are missing (someone reverted to a bespoke block),
//   - the block body no longer matches buildRegenBlock for the local-bin command,
//   - the command regressed to the `npx harness` npm default (wrong for this repo),
//   - a duplicate/leftover regen step was reintroduced.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOOK_BLOCK_BEGIN,
  HOOK_BLOCK_END,
  DEFAULT_REGEN_COMMAND,
  buildRegenBlock,
} from '../../src/commands/roadmap/install-hook';

/** The regen command this repo dogfoods: the LOCAL workspace build, not npm. */
const LOCAL_REGEN_COMMAND = 'node packages/cli/dist/bin/harness.js roadmap regen';

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Could not locate monorepo root (pnpm-workspace.yaml not found)');
    }
    dir = parent;
  }
}

describe('.husky/pre-commit dogfoods the roadmap install-hook managed block (#1079)', () => {
  const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  const hookPath = path.join(repoRoot, '.husky', 'pre-commit');
  const hook = fs.readFileSync(hookPath, 'utf-8');

  it('contains exactly one managed block delimited by the installer markers', () => {
    const begins = hook.split(HOOK_BLOCK_BEGIN).length - 1;
    const ends = hook.split(HOOK_BLOCK_END).length - 1;
    expect(begins).toBe(1);
    expect(ends).toBe(1);
  });

  it('embeds the verbatim buildRegenBlock output for the local-bin command', () => {
    // The exact string the installer would write is the contract: any drift in
    // buildRegenBlock must be reflected here (re-run the installer), or fail.
    expect(hook).toContain(buildRegenBlock(LOCAL_REGEN_COMMAND));
  });

  it('runs the local workspace build, never the npm `npx harness` default', () => {
    expect(hook).toContain(LOCAL_REGEN_COMMAND);
    // Guard against a regression to the adopter default, which would pull the
    // regen logic from npm instead of this repo's built CLI.
    expect(hook).not.toContain(`if ! ${DEFAULT_REGEN_COMMAND};`);
  });

  it('leaves no leftover bespoke regen step (single git add of the aggregate)', () => {
    const addAggregate = hook.split('git add docs/roadmap.md').length - 1;
    expect(addAggregate).toBe(1);
  });
});
