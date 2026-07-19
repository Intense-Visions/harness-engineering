import { describe, it, expect } from 'vitest';
import { verifyChangedPackages } from '../src/orchestrator.js';

/**
 * Guards the local verify gate's per-package build→typecheck→lint→test sequencing
 * (the mechanical step of runLocalWorkflowGate). Before this, the logic shelled
 * out to pnpm/git with no seam and was untested — a build-first regression could
 * silently block CORRECT code (false-red) or a reordering could let unbuilt code
 * pass (false-green). We inject a fake `run` that records the exact command
 * sequence so the ordering + short-circuit are asserted directly.
 */
describe('verifyChangedPackages', () => {
  type Pkg = { name?: string; scripts: Record<string, string> };
  const recorder = (results: Record<string, boolean> = {}) => {
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      const key = args.join(' ');
      const ok = results[key] ?? true;
      return { ok, output: ok ? '' : `${key} failed` };
    };
    return { calls, run };
  };
  const readPkgFrom =
    (map: Record<string, Pkg>) =>
    (dir: string): Pkg =>
      map[dir] ?? { scripts: {} };

  it('builds a changed package BEFORE its typecheck/lint/test (build-first)', async () => {
    const { calls, run } = recorder();
    const readPkg = readPkgFrom({
      'packages/eslint-plugin': {
        name: '@x/eslint-plugin',
        scripts: { build: 'tsup', typecheck: 'tsc', lint: 'eslint', test: 'vitest' },
      },
    });
    const res = await verifyChangedPackages(['packages/eslint-plugin'], readPkg, run);
    expect(res.ok).toBe(true);
    // build first, with the workspace-deps filter `name...`, then the three checks scoped to `name`.
    expect(calls).toEqual([
      ['--filter', '@x/eslint-plugin...', 'run', 'build'],
      ['--filter', '@x/eslint-plugin', 'run', 'typecheck'],
      ['--filter', '@x/eslint-plugin', 'run', 'lint'],
      ['--filter', '@x/eslint-plugin', 'run', 'test'],
    ]);
  });

  it('SHORT-CIRCUITS on a build failure — never runs lint/test on unbuilt code', async () => {
    const { calls, run } = recorder({ '--filter @x/p... run build': false });
    const readPkg = readPkgFrom({
      'packages/p': { name: '@x/p', scripts: { build: 'tsup', test: 'vitest' } },
    });
    const res = await verifyChangedPackages(['packages/p'], readPkg, run);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('build');
    expect(calls).toEqual([['--filter', '@x/p...', 'run', 'build']]); // stopped at build
  });

  it('skips the build step for a package with no build script (backward compatible)', async () => {
    const { calls, run } = recorder();
    const readPkg = readPkgFrom({
      'packages/pure': { name: '@x/pure', scripts: { typecheck: 'tsc', test: 'vitest' } },
    });
    const res = await verifyChangedPackages(['packages/pure'], readPkg, run);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      ['--filter', '@x/pure', 'run', 'typecheck'],
      ['--filter', '@x/pure', 'run', 'test'],
    ]);
  });

  it('returns the failing check and stops (a real defect still blocks)', async () => {
    const { calls, run } = recorder({ '--filter @x/p run test': false });
    const readPkg = readPkgFrom({
      'packages/p': { name: '@x/p', scripts: { build: 'tsup', lint: 'eslint', test: 'vitest' } },
    });
    const res = await verifyChangedPackages(['packages/p'], readPkg, run);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('test failed');
    // build, lint, then test (which fails) — no calls after the failure.
    expect(calls.map((c) => c[c.length - 1])).toEqual(['build', 'lint', 'test']);
  });

  it('skips packages with no resolvable name and builds each named package', async () => {
    const { calls, run } = recorder();
    const readPkg = readPkgFrom({
      'packages/unnamed': { scripts: { build: 'tsup' } }, // no name → skipped entirely
      'packages/a': { name: '@x/a', scripts: { build: 'tsup', test: 'vitest' } },
    });
    const res = await verifyChangedPackages(['packages/unnamed', 'packages/a'], readPkg, run);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      ['--filter', '@x/a...', 'run', 'build'],
      ['--filter', '@x/a', 'run', 'test'],
    ]);
  });
});
