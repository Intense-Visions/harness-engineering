import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_CONSTRAINT_PACKS,
  getConstraintPack,
  resolveConstraintPacks,
} from '../../src/constraints/packs';

describe('constraint packs — manifest', () => {
  it('ships the documented built-in packs', () => {
    const names = BUILT_IN_CONSTRAINT_PACKS.map((p) => p.name).sort();
    expect(names).toEqual(['ai-agent-safety', 'secrets-and-injection', 'web-hardening']);
  });

  it('every built-in pack declares at least one stage with an effect', () => {
    for (const pack of BUILT_IN_CONSTRAINT_PACKS) {
      const stages = Object.entries(pack.stages);
      expect(stages.length).toBeGreaterThan(0);
      for (const [, spec] of stages) {
        const hasEffect =
          (spec.securityRules && Object.keys(spec.securityRules).length > 0) ||
          spec.securityStrict === true;
        expect(hasEffect).toBe(true);
      }
    }
  });

  it('looks a pack up by name', () => {
    expect(getConstraintPack('web-hardening')?.name).toBe('web-hardening');
    expect(getConstraintPack('does-not-exist')).toBeUndefined();
  });
});

describe('resolveConstraintPacks', () => {
  it('resolves known packs and flags unknown names', () => {
    const resolved = resolveConstraintPacks(['secrets-and-injection', 'nonsense']);
    expect(resolved.resolved.map((p) => p.name)).toEqual(['secrets-and-injection']);
    expect(resolved.unknown).toEqual(['nonsense']);
  });

  it('empty input produces an empty, no-op overlay', () => {
    const resolved = resolveConstraintPacks([]);
    expect(resolved.resolved).toHaveLength(0);
    expect(resolved.unknown).toHaveLength(0);
    expect(resolved.securityRuleOverlay).toEqual({});
    expect(resolved.securityStrict).toBe(false);
  });

  it('flattens the security-rule overlay across all stages when no stage filter is given', () => {
    const resolved = resolveConstraintPacks(['secrets-and-injection']);
    expect(resolved.securityRuleOverlay).toMatchObject({
      'SEC-SEC-*': 'error',
      'SEC-INJ-*': 'error',
    });
  });

  it('applies only the requested stage when a stage filter is given', () => {
    // web-hardening only targets pre-release; asking for pre-merge yields no overlay.
    const preMerge = resolveConstraintPacks(['web-hardening'], { stage: 'pre-merge' });
    expect(preMerge.securityRuleOverlay).toEqual({});
    expect(preMerge.securityStrict).toBe(false);

    const preRelease = resolveConstraintPacks(['web-hardening'], { stage: 'pre-release' });
    expect(preRelease.securityRuleOverlay).toMatchObject({ 'SEC-XSS-*': 'error' });
    expect(preRelease.securityStrict).toBe(true);
  });

  it('merges overlapping rules to the most-blocking severity', () => {
    // Both packs target pre-merge; overlapping rule ids take the max severity.
    const resolved = resolveConstraintPacks(['secrets-and-injection', 'ai-agent-safety'], {
      stage: 'pre-merge',
    });
    expect(resolved.securityRuleOverlay['SEC-SEC-*']).toBe('error');
    expect(resolved.securityRuleOverlay['SEC-AGT-*']).toBe('error');
  });

  it('de-duplicates repeated pack names', () => {
    const resolved = resolveConstraintPacks(['secrets-and-injection', 'secrets-and-injection']);
    expect(resolved.resolved).toHaveLength(1);
  });
});
