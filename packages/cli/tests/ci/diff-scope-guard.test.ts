import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/no-relative-packages -- test reaches into repo-root scripts/ on purpose
import { assertDiffScope } from '../../../../scripts/lib/diff-scope-guard.mjs';
// eslint-disable-next-line import/no-relative-packages
import { assertBaselineOnly } from '../../../../scripts/lib/baseline-diff-guard.mjs';

describe('assertDiffScope', () => {
  it('accepts exact-path matches', () => {
    const r = assertDiffScope(['coverage-baselines.json'], ['coverage-baselines.json']);
    expect(r.ok).toBe(true);
  });

  it('accepts files under an allowed directory prefix', () => {
    const r = assertDiffScope(
      ['docs/roadmap.md', 'docs/roadmap.d/foo.md', 'docs/roadmap.d/_meta.md'],
      ['docs/roadmap.md', 'docs/roadmap.d/']
    );
    expect(r.ok).toBe(true);
    expect(r.offending).toEqual([]);
  });

  it('rejects a file outside both exact paths and directory prefixes', () => {
    const r = assertDiffScope(
      ['docs/roadmap.d/foo.md', 'packages/cli/src/evil.ts'],
      ['docs/roadmap.md', 'docs/roadmap.d/']
    );
    expect(r.ok).toBe(false);
    expect(r.offending).toEqual(['packages/cli/src/evil.ts']);
  });

  it('does not let a directory prefix match a sibling with the same stem', () => {
    // `docs/roadmap.d/` must NOT accept `docs/roadmap.dark/x` — prefix includes the slash.
    const r = assertDiffScope(['docs/roadmap.dark/x.md'], ['docs/roadmap.d/']);
    expect(r.ok).toBe(false);
  });

  it('fails closed on an empty diff', () => {
    expect(assertDiffScope([], ['docs/roadmap.d/']).ok).toBe(false);
    expect(assertDiffScope(['', '  '], ['docs/roadmap.d/']).ok).toBe(false);
  });
});

describe('assertBaselineOnly delegates to assertDiffScope (exact match, unchanged behavior)', () => {
  const ALLOW = [
    '.harness/arch/baselines.json',
    'packages/cli/.harness/arch/baselines.json',
    'coverage-baselines.json',
    'benchmark-baselines.json',
  ];

  it('still accepts the bare baselines.json files (no glob regression)', () => {
    expect(assertBaselineOnly(['.harness/arch/baselines.json'], ALLOW).ok).toBe(true);
    expect(assertBaselineOnly(ALLOW, ALLOW).ok).toBe(true);
  });

  it('still rejects foreign files and empty diffs', () => {
    expect(assertBaselineOnly(['packages/cli/src/x.ts'], ALLOW).ok).toBe(false);
    expect(assertBaselineOnly([], ALLOW).ok).toBe(false);
  });
});
