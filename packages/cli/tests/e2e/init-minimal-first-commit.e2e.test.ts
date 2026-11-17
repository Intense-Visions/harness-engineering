// Tier C — a brand-new `harness init --tier minimal` project must be able to make
// its FIRST commit. Post-release smoke of cli@14.1.0: the scaffolded pre-commit
// hook ran `harness check-arch`, which on a tree with no source files measures
// nothing and abstains with exit 3 (ZERO_DENOMINATOR). The hook treated every
// non-zero exit as a violation, so the very first `git commit` was blocked.
//
// The fix keeps check-arch honest (an abstention still exits 3, never 0) and
// teaches the hook that 3 means "nothing to check yet", while 1/2 still block.
// Real built binary, real git, real hook — a unit test over the hook text would
// not prove `git commit` actually succeeds.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HARNESS_BIN, runHarness, cleanup, skipUnlessBinPosix } from './support';

/** An over-complex function: 20 nested ifs, well past the seeded cap of 15. */
const OVER_COMPLEX =
  'export function f(n: number): number {\n  ' +
  Array.from({ length: 20 }, (_, i) => `if (n > ${i}) {`).join('') +
  'return 1;' +
  '}'.repeat(20) +
  '\n  return 0;\n}\n';

describe.skipIf(skipUnlessBinPosix)('init --tier minimal → first commit (spawned CLI)', () => {
  let proj: string;
  let shimDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    proj = mkdtempSync(path.join(tmpdir(), 'e2e-minimal-commit-'));
    // The hook resolves `harness` from PATH before falling back to npx; point it
    // at THIS build so the test exercises the code under review, not a global.
    shimDir = mkdtempSync(path.join(tmpdir(), 'e2e-minimal-shim-'));
    const shim = path.join(shimDir, 'harness');
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${HARNESS_BIN}" "$@"\n`);
    chmodSync(shim, 0o755);
    env = {
      ...process.env,
      PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
      HARNESS_NO_UPDATE_CHECK: '1',
      DO_NOT_TRACK: '1',
    };
    const git = (args: string[]) => spawnSync('git', args, { cwd: proj, encoding: 'utf8', env });
    git(['init', '-q']);
    git(['config', 'user.email', 'e2e@test']);
    git(['config', 'user.name', 'e2e']);
    const init = runHarness(['init', '--tier', 'minimal', '-y', '-n', 'demo'], { cwd: proj, env });
    expect(init.status, init.stderr).toBe(0);
  });

  afterEach(() => {
    cleanup(proj);
    cleanup(shimDir);
  });

  function commit(message: string) {
    spawnSync('git', ['add', '-A'], { cwd: proj, env });
    return spawnSync('git', ['commit', '-q', '-m', message], {
      cwd: proj,
      encoding: 'utf8',
      env,
      timeout: 120_000,
    });
  }

  it('the first commit of a fresh scaffold (no source files yet) succeeds', () => {
    const res = commit('init');
    expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
    // ...and the hook says WHY it let the commit through, rather than silently passing.
    expect(res.stderr).toMatch(/nothing to check yet/i);
  });

  it('a real architecture violation still blocks the commit (positive control)', () => {
    mkdirSync(path.join(proj, 'src'), { recursive: true });
    writeFileSync(path.join(proj, 'src', 'complex.ts'), OVER_COMPLEX);
    const res = commit('over-complex');
    expect(res.status, `${res.stdout}\n${res.stderr}`).not.toBe(0);
    expect(res.stderr).toMatch(/Commit blocked/);
  });

  it('check-arch on an empty tree: plain and --json report the same abstained verdict and exit code', () => {
    const plain = runHarness(['check-arch'], { cwd: proj, env });
    const json = runHarness(['check-arch', '--json'], { cwd: proj, env });
    // An abstention is never a pass: ZERO_DENOMINATOR (3) in both modes.
    expect(plain.status).toBe(3);
    expect(json.status).toBe(plain.status);

    const out = JSON.parse(json.stdout) as { verdict?: string; abstained?: boolean };
    expect(out.verdict).toBe('abstained');
    expect(out.abstained).toBe(true);

    const plainText = `${plain.stdout}\n${plain.stderr}`;
    expect(plainText).toMatch(/abstained/i);
    expect(plainText).not.toMatch(/validation passed/i);
  });
});
