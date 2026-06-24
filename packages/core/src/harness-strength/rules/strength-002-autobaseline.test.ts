import { describe, it, expect } from 'vitest';
import { strength002Autobaseline } from './strength-002-autobaseline';
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

// Trimmed from this repo's real .husky/pre-commit (auto-updates baselines on REGRESSION).
const FAILING_PRECOMMIT = `if ! node packages/cli/dist/bin/harness.js ci check --skip entropy 2>&1 | tee /tmp/log; then
  if grep -q "REGRESSION" /tmp/log; then
    npx harness check-arch --update-baseline >/dev/null 2>&1
    git add .harness/arch/baselines.json
  else
    exit 1
  fi
fi
`;

const PASSING_PRECOMMIT = `if ! node harness ci check; then
  exit 1
fi
npx lint-staged
`;

describe('STRENGTH-002 auto-baseline on regression', () => {
  it('flags a failure branch that auto-updates the baseline', () => {
    const findings = strength002Autobaseline.detect(ctx({ preCommit: FAILING_PRECOMMIT }));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.id).toBe('STRENGTH-002');
    expect(f.file).toBe('.husky/pre-commit');
    expect(f.line).toBeGreaterThan(0);
    expect('severity' in f).toBe(false);
  });

  it('passes a pre-commit that exits 1 on failure with no baseline rewrite', () => {
    expect(strength002Autobaseline.detect(ctx({ preCommit: PASSING_PRECOMMIT }))).toEqual([]);
  });

  it('flags a baseline rewrite even when a nested non-failure if/fi closes first', () => {
    // Regression: failureDepth decremented on the inner `fi`, dropping the
    // enclosing failure branch and missing the rewrite. The rewrite is still
    // inside the outer `if ! ...` failure branch and must FLAG.
    const NESTED = `if ! a; then
  if b; then echo x; fi
  x --update-baseline
fi
`;
    const findings = strength002Autobaseline.detect(ctx({ preCommit: NESTED }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('STRENGTH-002');
  });

  it('flags an uppercase --UPDATE-BASELINE inside a failure branch (case-insensitive)', () => {
    const UPPER = `if ! a; then
  x --UPDATE-BASELINE
fi
`;
    const findings = strength002Autobaseline.detect(ctx({ preCommit: UPPER }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('STRENGTH-002');
  });

  it('does not flag a baseline rewrite outside any failure branch', () => {
    const SAFE = `if ok; then echo good; fi
x --update-baseline
`;
    expect(strength002Autobaseline.detect(ctx({ preCommit: SAFE }))).toEqual([]);
  });

  it('is not evaluable when preCommit is null', () => {
    const c = ctx({ preCommit: null });
    expect(strength002Autobaseline.evaluable?.(c)).toBe(false);
    expect(strength002Autobaseline.detect(c)).toEqual([]);
  });
});
