import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
// eslint-disable-next-line import/no-relative-packages -- test reaches into repo-root scripts/ on purpose
import { assertBaselineOnly } from '../../../../scripts/lib/baseline-diff-guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ciWorkflowPath = path.resolve(here, '../../../../.github/workflows/ci.yml');
const raw = readFileSync(ciWorkflowPath, 'utf8');

// The exact allowlist the refresh-baselines job stages. The guard must accept
// these and only these — note two are bare `baselines.json`, so a `*-baselines.json`
// glob would wrongly reject them.
const ALLOW = [
  '.harness/arch/baselines.json',
  'packages/cli/.harness/arch/baselines.json',
  'coverage-baselines.json',
  'benchmark-baselines.json',
];

describe('assertBaselineOnly', () => {
  it('accepts the full baseline allowlist', () => {
    const r = assertBaselineOnly(ALLOW, ALLOW);
    expect(r.ok).toBe(true);
    expect(r.offending).toEqual([]);
  });

  it('accepts a subset of the allowlist (only some baselines changed)', () => {
    const r = assertBaselineOnly(['coverage-baselines.json'], ALLOW);
    expect(r.ok).toBe(true);
  });

  it('rejects a diff that reaches any file outside the allowlist', () => {
    const r = assertBaselineOnly(
      ['coverage-baselines.json', 'packages/cli/src/commands/check-arch.ts'],
      ALLOW
    );
    expect(r.ok).toBe(false);
    expect(r.offending).toEqual(['packages/cli/src/commands/check-arch.ts']);
  });

  it('fails closed on an empty diff (never self-approve a phantom PR)', () => {
    const r = assertBaselineOnly([], ALLOW);
    expect(r.ok).toBe(false);
  });

  it('ignores blank lines from `gh pr diff --name-only` output', () => {
    const r = assertBaselineOnly(['coverage-baselines.json', '', '  '], ALLOW);
    expect(r.ok).toBe(true);
    expect(r.changed).toEqual(['coverage-baselines.json']);
  });

  it('does NOT match on a `*-baselines.json` glob (bare baselines.json must pass)', () => {
    // Regression guard: the two arch baselines are named `baselines.json`, not
    // `*-baselines.json`. A glob-based allowlist would reject them.
    const r = assertBaselineOnly(['.harness/arch/baselines.json'], ALLOW);
    expect(r.ok).toBe(true);
  });

  it('accepts transient allowance DELETIONS under the allowance dir prefixes', () => {
    // The refresh job deletes consumed per-PR allowance files; those deletions show up in
    // the PR diff and must pass the self-approval guard via the `allowances/` dir prefixes.
    const scope = [...ALLOW, '.harness/arch/allowances/', 'packages/cli/.harness/arch/allowances/'];
    const r = assertBaselineOnly(
      ['.harness/arch/baselines.json', '.harness/arch/allowances/feat-x.json'],
      scope
    );
    expect(r.ok).toBe(true);
    expect(r.offending).toEqual([]);
  });

  it('still rejects a stray non-allowance file even with the allowance prefixes allowed', () => {
    const scope = [...ALLOW, '.harness/arch/allowances/', 'packages/cli/.harness/arch/allowances/'];
    const r = assertBaselineOnly(['.harness/arch/allowances/feat-x.json', 'src/evil.ts'], scope);
    expect(r.ok).toBe(false);
    expect(r.offending).toEqual(['src/evil.ts']);
  });
});

describe('ci.yml refresh-baselines self-approval guard', () => {
  const wf = parse(raw) as {
    jobs: Record<
      string,
      { steps: Array<{ run?: string; name?: string; env?: Record<string, string> }> }
    >;
  };
  const refreshStep = Object.values(wf.jobs)
    .flatMap((j) => j.steps)
    .find((s) => (s.run ?? '').includes('gh pr review'));
  const stepRun = refreshStep?.run ?? '';

  it('runs the diff-scope guard before self-approving', () => {
    const guardIdx = stepRun.indexOf('assert-baseline-only-diff.mjs');
    const approveIdx = stepRun.indexOf('gh pr review');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(approveIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(approveIdx);
  });

  it('feeds the guard the PR diff and the $SCOPE_ALLOW allowlist (baselines + allowance prefixes)', () => {
    expect(stepRun).toMatch(/gh pr diff "\$PR_URL" --name-only/);
    expect(stepRun).toMatch(/assert-baseline-only-diff\.mjs \$SCOPE_ALLOW/);
    // SCOPE_ALLOW is the baseline files PLUS the transient allowance dir prefixes.
    expect(stepRun).toMatch(/SCOPE_ALLOW="\$BASELINE_FILES [^"]*allowances\//);
  });

  it('deletes consumed per-PR allowances so they never accumulate on main', () => {
    expect(stepRun).toMatch(/rm -f .*\.harness\/arch\/allowances\/\*\.json/);
  });

  it('advances the authoritative snapshot past merged allowances (--allow-regress + force env)', () => {
    // FINDING 1: without --allow-regress the post-merge refresh hits the #530 guard (merged
    // code regresses vs the un-advanced committed baseline) and the baseline never advances;
    // without the force env the detached-HEAD checkout could resolve base-ref and write an
    // allowance instead of advancing. Both must be present on the refresh check-arch step.
    const refreshCheckArch = Object.values(wf.jobs)
      .flatMap((j) => j.steps)
      .find((s) => (s.run ?? '').includes('check-arch --update-baseline'));
    expect(refreshCheckArch).toBeDefined();
    expect(refreshCheckArch?.run).toMatch(/check-arch --update-baseline --allow-regress --reason/);
    expect(refreshCheckArch?.env?.HARNESS_ARCH_FORCE_WORKING_TREE).toBe('1');
  });
});
