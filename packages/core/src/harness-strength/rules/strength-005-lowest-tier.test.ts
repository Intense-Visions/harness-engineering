import { describe, it, expect } from 'vitest';
import { strength005LowestTier } from './strength-005-lowest-tier';
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

describe('STRENGTH-005 lowest-tier default', () => {
  it('flags an adopter config pinned to the basic tier', () => {
    const findings = strength005LowestTier.detect(
      ctx({ mode: 'adopter', config: { template: { level: 'basic' } } })
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.id).toBe('STRENGTH-005');
    expect(f.file).toBe('harness.config.json');
    expect('severity' in f).toBe(false);
  });

  it('passes an adopter config on a higher tier', () => {
    expect(
      strength005LowestTier.detect(
        ctx({ mode: 'adopter', config: { template: { level: 'standard' } } })
      )
    ).toEqual([]);
  });

  it('flags a toolkit init skill that defaults to basic', () => {
    const findings = strength005LowestTier.detect(
      ctx({
        mode: 'toolkit',
        config: null,
        initSkill: 'Recommendation: default to the basic tier for new projects.\n',
      })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toContain('initialize-harness-project');
  });

  it('passes a toolkit init skill recommending standard', () => {
    expect(
      strength005LowestTier.detect(
        ctx({
          mode: 'toolkit',
          config: null,
          initSkill: 'Recommendation: default to the standard tier for new projects.\n',
        })
      )
    ).toEqual([]);
  });

  it('is not evaluable for adopter when config is null', () => {
    const c = ctx({ mode: 'adopter', config: null });
    expect(strength005LowestTier.evaluable?.(c)).toBe(false);
    expect(strength005LowestTier.detect(c)).toEqual([]);
  });

  it('is not evaluable for toolkit when initSkill is null', () => {
    const c = ctx({ mode: 'toolkit', config: null, initSkill: null });
    expect(strength005LowestTier.evaluable?.(c)).toBe(false);
    expect(strength005LowestTier.detect(c)).toEqual([]);
  });
});
