import { describe, it, expect } from 'vitest';
import { strength003SkipList } from './strength-003-skip-list';
import type { ProjectContext } from '../types';

function ctx(partial: Partial<ProjectContext>): ProjectContext {
  return {
    root: '/r',
    mode: 'adopter',
    config: null,
    preCommit: null,
    hookFiles: [],
    workflows: [],
    healthSnapshot: null,
    ...partial,
  };
}

describe('STRENGTH-003 oversized --skip list', () => {
  it('flags a --skip list of more than 2 categories without justification', () => {
    const findings = strength003SkipList.detect(
      ctx({
        preCommit:
          'node harness ci check --skip entropy,docs,perf,security,deps,phase-gate 2>&1 | tee /tmp/log\n',
      })
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.id).toBe('STRENGTH-003');
    expect(f.file).toBe('.husky/pre-commit');
    expect(f.line).toBe(1);
    expect(f.message).toMatch(/6/);
    expect('severity' in f).toBe(false);
  });

  it('passes when 2 or fewer categories are skipped', () => {
    expect(
      strength003SkipList.detect(ctx({ preCommit: 'harness ci check --skip entropy,docs\n' }))
    ).toEqual([]);
  });

  it('passes when the skip is justified by an inline comment', () => {
    expect(
      strength003SkipList.detect(
        ctx({ preCommit: 'harness ci check --skip a,b,c,d # justified: these run in CI\n' })
      )
    ).toEqual([]);
  });

  it('flags when the only `#` is inside a token, not a real comment boundary', () => {
    // A `#` that is part of an argument value (e.g. `--tag "#release"`) is NOT a
    // shell comment and must not count as inline justification.
    const findings = strength003SkipList.detect(
      ctx({ preCommit: 'harness ci check --skip a,b,c,d --tag "#release"\n' })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('STRENGTH-003');
  });

  it('passes (evaluable) when there is no --skip at all', () => {
    const c = ctx({ preCommit: 'harness ci check\nnpx lint-staged\n' });
    expect(strength003SkipList.evaluable?.(c)).toBe(true);
    expect(strength003SkipList.detect(c)).toEqual([]);
  });

  it('is not evaluable when preCommit is null', () => {
    const c = ctx({ preCommit: null });
    expect(strength003SkipList.evaluable?.(c)).toBe(false);
    expect(strength003SkipList.detect(c)).toEqual([]);
  });
});
