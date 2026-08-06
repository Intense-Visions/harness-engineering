import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveArchBaseline,
  loadArchAllowances,
  filterDiffByAllowances,
  writeArchAllowance,
  archAllowanceSlug,
  archAllowancesDir,
} from '../../src/architecture/baseline-resolver';
import { ArchBaselineManager } from '../../src/architecture/baseline-manager';
import type { ArchBaseline, ArchDiffResult, Violation } from '../../src/architecture/types';

const BASELINE_REL = '.harness/arch/baselines.json';

function makeBaseline(complexityValue: number, violationIds: string[] = []): ArchBaseline {
  return {
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedFrom: 'seed',
    metrics: { complexity: { value: complexityValue, violationIds } },
  };
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

/** Init a git repo with `main` as the default branch and an identity. */
function initRepo(dir: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
}

/** Write a baseline file (relative to `root`, into optional package `prefix`) and stage+commit it. */
function commitBaseline(root: string, baseline: ArchBaseline, prefix = ''): void {
  const rel = join(prefix, BASELINE_REL);
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, JSON.stringify(baseline, null, 2));
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline']);
}

describe('resolveArchBaseline (base-aware)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'arch-resolver-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads the BASE ref baseline on a feature branch, ignoring the branch working-tree copy', () => {
    initRepo(root);
    commitBaseline(root, makeBaseline(100)); // main baseline
    git(root, ['checkout', '-b', 'feature']);
    // The branch rewrites the committed baseline (the old, cascade-causing behavior).
    writeFileSync(join(root, BASELINE_REL), JSON.stringify(makeBaseline(999), null, 2));
    git(root, ['commit', '-am', 'branch rewrites baseline']);

    const manager = new ArchBaselineManager(root);
    const resolution = resolveArchBaseline(root, BASELINE_REL, manager, { baseRef: 'main' });

    expect(resolution.source).toBe('base-ref');
    expect(resolution.baseRef).toBe('main');
    // Base-aware: the gate is compared against MAIN's value, not the branch's rewrite.
    expect(resolution.baseline?.metrics.complexity?.value).toBe(100);
    // Sanity: the working-tree copy really did diverge.
    expect(manager.load()?.metrics.complexity?.value).toBe(999);
  });

  it('resolves a NESTED package baseline via the repo-root-relative path (--show-prefix)', () => {
    initRepo(root);
    commitBaseline(root, makeBaseline(42), 'packages/cli');
    git(root, ['checkout', '-b', 'feature']);

    const sub = join(root, 'packages/cli');
    const manager = new ArchBaselineManager(sub);
    const resolution = resolveArchBaseline(sub, BASELINE_REL, manager, { baseRef: 'main' });

    expect(resolution.source).toBe('base-ref');
    expect(resolution.baseline?.metrics.complexity?.value).toBe(42);
  });

  it('falls back to the working-tree file when the base ref is unresolvable', () => {
    initRepo(root);
    commitBaseline(root, makeBaseline(7));
    git(root, ['checkout', '-b', 'feature']);

    const manager = new ArchBaselineManager(root);
    const resolution = resolveArchBaseline(root, BASELINE_REL, manager, {
      baseRef: 'origin/does-not-exist',
    });

    expect(resolution.source).toBe('working-tree');
    expect(resolution.baseline?.metrics.complexity?.value).toBe(7);
  });

  it('falls back to the working-tree file when on the base branch itself (main)', () => {
    initRepo(root);
    commitBaseline(root, makeBaseline(50));
    // still on main
    const manager = new ArchBaselineManager(root);
    const resolution = resolveArchBaseline(root, BASELINE_REL, manager, { baseRef: 'main' });
    expect(resolution.source).toBe('working-tree');
    expect(resolution.baseline?.metrics.complexity?.value).toBe(50);
  });

  it('falls back to the working-tree file when the directory is not a git repo', () => {
    // no initRepo — plain dir
    mkdirSync(join(root, '.harness', 'arch'), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), JSON.stringify(makeBaseline(3), null, 2));
    const manager = new ArchBaselineManager(root);
    const resolution = resolveArchBaseline(root, BASELINE_REL, manager);
    expect(resolution.source).toBe('working-tree');
    expect(resolution.baseline?.metrics.complexity?.value).toBe(3);
  });

  it('falls back to the working-tree file when the base copy is invalid JSON (fail-open)', () => {
    initRepo(root);
    // Commit a garbage baseline on main.
    mkdirSync(join(root, '.harness', 'arch'), { recursive: true });
    writeFileSync(join(root, BASELINE_REL), 'not-json{{{');
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'garbage']);
    git(root, ['checkout', '-b', 'feature']);
    // A valid working-tree copy exists on the branch.
    writeFileSync(join(root, BASELINE_REL), JSON.stringify(makeBaseline(11), null, 2));

    const manager = new ArchBaselineManager(root);
    const resolution = resolveArchBaseline(root, BASELINE_REL, manager, { baseRef: 'main' });
    // Never a hard failure: the invalid base copy is ignored, working tree wins.
    expect(resolution.source).toBe('working-tree');
    expect(resolution.baseline?.metrics.complexity?.value).toBe(11);
  });

  it('honors $HARNESS_ARCH_BASE_REF as the default base ref', () => {
    initRepo(root);
    commitBaseline(root, makeBaseline(64));
    git(root, ['checkout', '-b', 'feature']);
    const prev = process.env.HARNESS_ARCH_BASE_REF;
    process.env.HARNESS_ARCH_BASE_REF = 'main';
    try {
      const manager = new ArchBaselineManager(root);
      const resolution = resolveArchBaseline(root, BASELINE_REL, manager);
      expect(resolution.source).toBe('base-ref');
      expect(resolution.baseline?.metrics.complexity?.value).toBe(64);
    } finally {
      if (prev === undefined) delete process.env.HARNESS_ARCH_BASE_REF;
      else process.env.HARNESS_ARCH_BASE_REF = prev;
    }
  });
});

// --- Allowances -------------------------------------------------------------

function warn(id: string): Violation {
  return { id, file: `src/${id}.ts`, detail: 'complex fn', severity: 'warning' };
}
function err(id: string): Violation {
  return { id, file: `src/${id}.ts`, detail: 'over threshold', severity: 'error' };
}

function diffWith(overrides: Partial<ArchDiffResult>): ArchDiffResult {
  return {
    passed: false,
    newViolations: [],
    resolvedViolations: [],
    preExisting: [],
    regressions: [],
    ...overrides,
  };
}

describe('arch allowances', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'arch-allow-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loads + aggregates allowances (union of ids, max category ceiling), skipping invalid files', () => {
    const dir = archAllowancesDir(root, BASELINE_REL);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'branch-a.json'),
      JSON.stringify({ reason: 'a', categories: { complexity: 300 }, violationIds: ['v1'] })
    );
    writeFileSync(
      join(dir, 'branch-b.json'),
      JSON.stringify({ reason: 'b', categories: { complexity: 350 }, violationIds: ['v2'] })
    );
    writeFileSync(join(dir, 'broken.json'), 'not-json{{{'); // must be skipped
    writeFileSync(join(dir, 'notes.txt'), 'ignored'); // non-json ignored

    const coverage = loadArchAllowances(root, BASELINE_REL);
    expect([...coverage.violationIds].sort()).toEqual(['v1', 'v2']);
    expect(coverage.categoryCeilings.get('complexity')).toBe(350); // max, not sum
    expect(coverage.files).toHaveLength(2);
  });

  it('returns empty coverage when the allowances dir is absent', () => {
    const coverage = loadArchAllowances(root, BASELINE_REL);
    expect(coverage.violationIds.size).toBe(0);
    expect(coverage.files).toHaveLength(0);
  });

  it('covers warning-severity new violations and ceiling-covered regressions', () => {
    const rawDiff = diffWith({
      newViolations: [warn('v1'), warn('v2')],
      regressions: [{ category: 'complexity', baselineValue: 300, currentValue: 312, delta: 12 }],
    });
    const coverage = {
      violationIds: new Set(['v1', 'v2']),
      categoryCeilings: new Map([['complexity' as const, 312]]),
      files: [],
      reasons: [],
    };
    const filtered = filterDiffByAllowances(rawDiff, coverage);
    expect(filtered.passed).toBe(true);
    expect(filtered.newViolations).toHaveLength(0);
    expect(filtered.regressions).toHaveLength(0);
    expect(filtered.allowedNewViolations).toHaveLength(2);
    expect(filtered.allowedRegressions).toHaveLength(1);
  });

  it('NEVER covers an error-severity new violation, even if its id is allowanced (hard gate)', () => {
    const rawDiff = diffWith({ newViolations: [err('e1')] });
    const coverage = {
      violationIds: new Set(['e1']),
      categoryCeilings: new Map(),
      files: [],
      reasons: [],
    };
    const filtered = filterDiffByAllowances(rawDiff, coverage);
    expect(filtered.passed).toBe(false);
    expect(filtered.newViolations.map((v) => v.id)).toEqual(['e1']);
    expect(filtered.allowedNewViolations).toHaveLength(0);
  });

  it('does not cover a regression whose current value exceeds the allowance ceiling', () => {
    const rawDiff = diffWith({
      regressions: [{ category: 'complexity', baselineValue: 300, currentValue: 400, delta: 100 }],
    });
    const coverage = {
      violationIds: new Set<string>(),
      categoryCeilings: new Map([['complexity' as const, 350]]), // ceiling below current 400
      files: [],
      reasons: [],
    };
    const filtered = filterDiffByAllowances(rawDiff, coverage);
    expect(filtered.passed).toBe(false);
    expect(filtered.regressions).toHaveLength(1);
  });

  it('conflict-free: two branches write DISTINCT allowance filenames (never collide)', () => {
    const root2 = mkdtempSync(join(tmpdir(), 'arch-allow2-'));
    try {
      // Two repos on differently-named branches.
      for (const [dir, branch] of [
        [root, 'feat/one'],
        [root2, 'feat/two'],
      ] as const) {
        initRepo(dir);
        writeFileSync(join(dir, 'seed.txt'), 'x');
        git(dir, ['add', '-A']);
        git(dir, ['commit', '-m', 'seed']);
        git(dir, ['checkout', '-b', branch]);
      }
      const slug1 = archAllowanceSlug(root);
      const slug2 = archAllowanceSlug(root2);
      expect(slug1).toBe('feat-one');
      expect(slug2).toBe('feat-two');
      expect(slug1).not.toBe(slug2);

      // Simulate both branches' allowances landing in the SAME merged dir: no overwrite.
      const merged = mkdtempSync(join(tmpdir(), 'arch-merged-'));
      try {
        writeArchAllowance(
          merged,
          BASELINE_REL,
          { reason: 'one', categories: {}, violationIds: [] },
          slug1
        );
        writeArchAllowance(
          merged,
          BASELINE_REL,
          { reason: 'two', categories: {}, violationIds: [] },
          slug2
        );
        const files = readdirSync(archAllowancesDir(merged, BASELINE_REL)).sort();
        expect(files).toEqual(['feat-one.json', 'feat-two.json']);
      } finally {
        rmSync(merged, { recursive: true, force: true });
      }
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('writeArchAllowance writes valid JSON that loadArchAllowances round-trips', () => {
    const file = writeArchAllowance(
      root,
      BASELINE_REL,
      { reason: 'accepted growth', categories: { complexity: 312 }, violationIds: ['v9'] },
      'my-branch'
    );
    expect(existsSync(file)).toBe(true);
    const coverage = loadArchAllowances(root, BASELINE_REL);
    expect(coverage.categoryCeilings.get('complexity')).toBe(312);
    expect([...coverage.violationIds]).toEqual(['v9']);
    expect(coverage.reasons).toEqual(['accepted growth']);
  });
});
