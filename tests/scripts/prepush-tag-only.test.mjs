/**
 * The pre-push hook must not run the file-content gauntlet for a TAG-ONLY push.
 *
 * Context (#2289): pushing a release tag runs pre-push, which then grades the
 * checkout's working state — changeset presence, prettier, typecheck, coverage,
 * generated-doc freshness — none of which a tag push can affect. During the
 * v13.0.0 release that blocked a tag push from a checkout whose unrelated state
 * was stale.
 *
 * The hook is exercised for real (`sh -e .husky/pre-push`) in a throwaway
 * directory, with a `pnpm` stub on PATH that always fails. So "the gauntlet did
 * not run" is proven by the hook exiting 0 while the stub recorded no calls —
 * and the branch-push case proves the gauntlet is still reached, i.e. that the
 * skip did not weaken a normal push.
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Copy the hook into an empty directory and run it with the given stdin.
 *
 * Only `.husky/pre-push` is copied: `ensure-node-pin.sh` is deliberately absent
 * so the hook's own `[ -f ]` guard skips it, keeping the fixture free of any
 * version-manager dependency. Every gate the hook runs goes through `pnpm`,
 * which here is a stub that records its invocation and exits 1.
 */
function runHook(stdin) {
  const dir = mkdtempSync(join(tmpdir(), 'harness-prepush-'));
  mkdirSync(join(dir, '.husky'));
  copyFileSync(join(repoRoot, '.husky', 'pre-push'), join(dir, '.husky', 'pre-push'));

  const binDir = join(dir, 'fakebin');
  mkdirSync(binDir);
  const marker = join(dir, 'pnpm-was-called');
  writeFileSync(
    join(binDir, 'pnpm'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(marker)}\nexit 1\n`
  );
  chmodSync(join(binDir, 'pnpm'), 0o755);

  const result = spawnSync('sh', ['-e', '.husky/pre-push', 'origin', 'git@example.com:x/y.git'], {
    cwd: dir,
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, HUSKY: '' },
  });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    gateRan: existsSync(marker),
    gateCalls: existsSync(marker) ? readFileSync(marker, 'utf8') : '',
  };
}

const TAG_REF =
  'refs/tags/@harness-engineering/cli@13.0.0 1111111111111111111111111111111111111111 refs/tags/@harness-engineering/cli@13.0.0 0000000000000000000000000000000000000000\n';
const BRANCH_REF =
  'refs/heads/feature 1111111111111111111111111111111111111111 refs/heads/feature 0000000000000000000000000000000000000000\n';

test('pre-push: a tag-only push skips the gauntlet', () => {
  const result = runHook(TAG_REF);
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  assert.equal(result.gateRan, false, `a gate ran anyway: ${result.gateCalls}`);
  assert.match(result.stdout, /tag-only push/);
});

test('pre-push: two tag refs in one push still skip the gauntlet', () => {
  const result = runHook(TAG_REF + TAG_REF.replace('13.0.0', '13.0.1'));
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  assert.equal(result.gateRan, false, `a gate ran anyway: ${result.gateCalls}`);
});

test('pre-push: a branch push still runs the gauntlet', () => {
  const result = runHook(BRANCH_REF);
  assert.notEqual(result.status, 0);
  assert.equal(result.gateRan, true);
  assert.match(result.gateCalls, /check:changesets/);
});

test('pre-push: a push mixing a branch and a tag still runs the gauntlet', () => {
  const result = runHook(TAG_REF + BRANCH_REF);
  assert.notEqual(result.status, 0);
  assert.equal(result.gateRan, true);
});

test('pre-push: empty stdin falls through to the gauntlet', () => {
  const result = runHook('');
  assert.notEqual(result.status, 0);
  assert.equal(result.gateRan, true);
});
