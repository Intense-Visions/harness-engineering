import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * End-to-end regression proof for #1421: the `.husky/pre-commit` gate must DIAGNOSE an
 * unbuilt CLI accurately, not misattribute it to an architecture-baseline regression.
 *
 * The bug: `.husky/pre-commit` shells out to `packages/cli/dist/bin/harness.js`. In a
 * fresh worktree/clone `packages/cli/dist` is gitignored and never built, so the node
 * invocation dies with MODULE_NOT_FOUND — zero checks executed. The failure branch,
 * however, attributed every non-zero exit to a check regression and advised
 * `harness check-arch --update-baseline`; following that advice commits a bogus
 * baseline in response to a missing build.
 *
 * The fix (issue Option 1): assert the entrypoint exists BEFORE invoking it. If it is
 * missing, fail with a distinct, actionable "the harness CLI is not built — run
 * pnpm build" message that never mentions the baseline remedy.
 *
 * Like the sibling #726 gate e2e, this extracts the REAL gate block from the committed
 * `.husky/pre-commit` (not a hand-rewritten copy) and runs it under `/bin/sh` via a
 * real `git commit`, exactly mirroring how the gate executes in production.
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
 * Extract the gate block from the real `.husky/pre-commit` — everything from the top of
 * the file up to (but not including) `npx lint-staged` — so the committed unbuilt-CLI
 * guard is what is under test. The `harness ci check` producer is rewritten to a stub
 * that exits with $CI_CHECK_EXIT so the positive-control case (entrypoint present, gate
 * passes) is deterministic; in the guard case the producer is never reached.
 */
function buildGateHook(repoRoot: string): string {
  const hookSrc = fs.readFileSync(path.join(repoRoot, '.husky', 'pre-commit'), 'utf-8');
  const lines = hookSrc.split('\n');
  const endIdx = lines.findIndex((l) => l.trim() === 'npx lint-staged');
  if (endIdx === -1) {
    throw new Error('`npx lint-staged` marker not found in .husky/pre-commit');
  }
  const block = lines.slice(0, endIdx).join('\n');
  const rewritten = block.replace(
    /node packages\/cli\/dist\/bin\/harness\.js ci check[^>|]*/,
    'sh -c \'echo "arch: ok (stub)"; exit ${CI_CHECK_EXIT:-0}\' '
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

function provisionBuiltCli(): void {
  const cliEntry = path.join(cwd, 'packages', 'cli', 'dist', 'bin', 'harness.js');
  fs.mkdirSync(path.dirname(cliEntry), { recursive: true });
  fs.writeFileSync(cliEntry, '// stub entrypoint — presence satisfies the built-CLI guard\n');
}

beforeEach(() => {
  repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'unbuilt-cli-gate-e2e-'));

  git(['init', '-q']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);

  const hookPath = path.join(cwd, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, buildGateHook(repoRoot));
  fs.chmodSync(hookPath, 0o755);

  fs.writeFileSync(path.join(cwd, 'README.md'), '# scratch\n');
  git(['add', 'README.md']);
  git(['commit', '-q', '--no-verify', '-m', 'baseline']);
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

// The hook runs under POSIX `sh` (husky uses `sh -e`); windows-latest can't reliably
// reproduce that shell for git hooks. The fix is a POSIX-shell guarantee — skip win32.
describe.skipIf(process.platform === 'win32')('pre-commit unbuilt-CLI gate (e2e)', () => {
  it('BLOCKS with an accurate "not built" message when the CLI entrypoint is missing (#1421)', () => {
    // No packages/cli/dist/bin/harness.js in the temp repo — the fresh-worktree case.
    const headBefore = git(['rev-parse', 'HEAD']).trim();

    fs.writeFileSync(path.join(cwd, 'change.txt'), 'a staged change\n');
    git(['add', 'change.txt']);

    let failed = false;
    let output = '';
    try {
      git(['commit', '-m', 'change that should be blocked by the unbuilt-CLI guard']);
    } catch (err) {
      failed = true;
      const e = err as { stdout?: string; stderr?: string };
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    // The guard must block the commit.
    expect(failed).toBe(true);
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(headBefore);

    // The message is the accurate, actionable one.
    expect(output).toContain('the harness CLI is not built');
    expect(output).toContain('pnpm build');

    // And it must NOT misdiagnose this as an arch-baseline regression: neither the
    // dangerous remedy flag nor the "intentional architecture baseline change" advice.
    expect(output).not.toContain('--update-baseline');
    expect(output).not.toContain('architecture baseline change');
  });

  it('passes the guard and reaches the check gate when the CLI is built', () => {
    provisionBuiltCli();
    const headBefore = git(['rev-parse', 'HEAD']).trim();

    fs.writeFileSync(path.join(cwd, 'change.txt'), 'a staged change\n');
    git(['add', 'change.txt']);

    // Entrypoint present + stubbed gate exits 0 → the guard is transparent and the
    // commit proceeds. Proves the guard is not trivially always-on.
    git(['commit', '-q', '-m', 'change that should pass'], { CI_CHECK_EXIT: '0' });

    expect(git(['rev-parse', 'HEAD']).trim()).not.toBe(headBefore);
    expect(git(['ls-tree', '-r', '--name-only', 'HEAD'])).toContain('change.txt');
  });
});
