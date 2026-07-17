import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end regression proof for #726: the `.husky/pre-commit` ci-check gate must
 * be FAIL-CLOSED — a nonzero exit from `harness ci check` (e.g. an arch regression)
 * must BLOCK the commit.
 *
 * The bug: the gate was written as
 *
 *   if ! node .../harness.js ci check ... 2>&1 | tee /tmp/harness-pre-commit.log; then
 *
 * A pipeline's exit status is that of its LAST command (`tee`, ~always 0), so
 * `! ( producer | tee )` evaluates `! 0` = false and the `exit 1` branch is NEVER
 * taken even when `ci check` prints `x arch: fail` and exits nonzero. The gate was
 * silently disarmed.
 *
 * This test extracts the REAL ci-check gate block from the committed
 * `.husky/pre-commit` (not a hand-rewritten copy) so a regression back to a
 * masking pipe (`| tee`, or a `set -o pipefail` that dies under dash) fails here.
 * Only the producer — the `node .../harness.js ci check ...` invocation — is
 * rewritten to a stub whose exit code is driven by the CI_CHECK_EXIT env var, so
 * the pipe/redirect STRUCTURE of the gate is what is under test, deterministically.
 *
 * Husky v9 invokes hooks via `sh -e "$s"` (see `.husky/_/h`), so `sh` may be dash
 * on Linux CI. The test runs the block under `/bin/sh` via a real `git commit`,
 * exactly mirroring how the gate executes in production.
 */

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

/**
 * Extract the ci-check gate block from the real `.husky/pre-commit` — everything
 * from the top of the file up to (but not including) `npx lint-staged`, which is
 * the first line after the gate's closing `fi` + success `cat`. Rewrite the
 * `harness ci check` producer to a stub that exits with $CI_CHECK_EXIT, keeping the
 * `if ! <producer> >log 2>&1; then ... fi` structure verbatim.
 */
function buildGateHook(repoRoot: string): string {
  const hookSrc = fs.readFileSync(path.join(repoRoot, '.husky', 'pre-commit'), 'utf-8');
  const lines = hookSrc.split('\n');
  const endIdx = lines.findIndex((l) => l.trim() === 'npx lint-staged');
  if (endIdx === -1) {
    throw new Error('`npx lint-staged` marker not found in .husky/pre-commit');
  }
  const block = lines.slice(0, endIdx).join('\n');

  // Replace the producer invocation with a controllable stub. The regex matches the
  // real `node packages/cli/dist/bin/harness.js ci check --skip ...` producer up to
  // (but not including) the output redirection, so the `>log 2>&1` and the `if !`
  // wrapper stay exactly as committed.
  const rewritten = block.replace(
    /node packages\/cli\/dist\/bin\/harness\.js ci check[^>|]*/,
    'sh -c \'echo "x arch: fail (stub)"; exit ${CI_CHECK_EXIT:-0}\' '
  );
  if (rewritten === block) {
    throw new Error('ci-check producer line not found/rewritten in .husky/pre-commit');
  }
  return `#!/bin/sh\n${rewritten}\n`;
}

let repoRoot: string;
let cwd: string;

function git(args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, ...env } });
}

beforeEach(() => {
  repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cicheck-gate-e2e-'));

  git(['init', '-q']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);

  const hookPath = path.join(cwd, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, buildGateHook(repoRoot));
  fs.chmodSync(hookPath, 0o755);

  // Baseline commit created with the hook bypassed (env unset → stub exits 0, so
  // the gate passes anyway, but --no-verify keeps the baseline independent of it).
  fs.writeFileSync(path.join(cwd, 'README.md'), '# scratch\n');
  git(['add', 'README.md']);
  git(['commit', '-q', '--no-verify', '-m', 'baseline']);
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

// This e2e runs the POSIX-shell `.husky/pre-commit` ci-check gate block via a real
// `git commit`. The hook runs under `sh` (husky uses `sh -e`); the windows-latest CI
// runner can't reliably reproduce that shell for git hooks. Skip on win32 — the fix
// is a shell-portability guarantee that only the POSIX platforms need to prove.
describe.skipIf(process.platform === 'win32')('pre-commit ci-check gate (e2e)', () => {
  it('BLOCKS the commit when `harness ci check` exits nonzero (#726 fail-closed)', () => {
    const headBefore = git(['rev-parse', 'HEAD']).trim();

    fs.writeFileSync(path.join(cwd, 'change.txt'), 'a staged change\n');
    git(['add', 'change.txt']);

    let failed = false;
    let output = '';
    try {
      // CI_CHECK_EXIT=1 → the stubbed producer exits nonzero (an arch regression).
      git(['commit', '-m', 'change that should be blocked'], { CI_CHECK_EXIT: '1' });
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    // The gate must block: nonzero exit from `ci check` → nonzero exit from the hook.
    expect(failed).toBe(true);
    expect(output).toContain('Commit blocked');
    // The producer's captured output is surfaced (proves the log is shown on failure).
    expect(output).toContain('x arch: fail (stub)');
    // No commit was created.
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(headBefore);
  });

  it('ALLOWS the commit when `harness ci check` exits zero', () => {
    const headBefore = git(['rev-parse', 'HEAD']).trim();

    fs.writeFileSync(path.join(cwd, 'change.txt'), 'a staged change\n');
    git(['add', 'change.txt']);

    // CI_CHECK_EXIT=0 → the stubbed producer passes; the commit proceeds. Bypass the
    // downstream lint-staged/plugin/roadmap blocks (not under test) via --no-verify?
    // No — those blocks are part of the extracted hook only up to `npx lint-staged`,
    // which is excluded, so the temp hook ends right after the gate's success `cat`.
    git(['commit', '-q', '-m', 'change that should pass'], { CI_CHECK_EXIT: '0' });

    expect(git(['rev-parse', 'HEAD']).trim()).not.toBe(headBefore);
    const tree = git(['ls-tree', '-r', '--name-only', 'HEAD']);
    expect(tree).toContain('change.txt');
  });
});
