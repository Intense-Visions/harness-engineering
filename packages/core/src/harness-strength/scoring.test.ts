import { describe, it, expect } from 'vitest';
import { rollupScore, tierFor, SEVERITY_WEIGHTS } from './scoring';
import type { StrengthFinding } from './types';

const f = (severity: StrengthFinding['severity']): StrengthFinding => ({
  id: 'STRENGTH-001',
  gearPiece: 'g',
  severity,
  file: 'f',
  message: 'm',
  remediation: 'r',
});

describe('rollupScore', () => {
  it('scores 100 / solid with no findings', () => {
    expect(rollupScore([])).toEqual({ score: 100, tier: 'solid' });
  });

  it('applies per-severity weights (error=14, warning=6, info=2)', () => {
    expect(SEVERITY_WEIGHTS).toEqual({ error: 14, warning: 6, info: 2 });
    // 1 error + 1 warning + 1 info = 100 - 22 = 78 -> at-risk
    expect(rollupScore([f('error'), f('warning'), f('info')])).toEqual({
      score: 78,
      tier: 'at-risk',
    });
  });

  it('floors near 0 and clamps non-negative for 7 errors', () => {
    const seven = Array.from({ length: 7 }, () => f('error')); // 100 - 98 = 2
    expect(rollupScore(seven)).toEqual({ score: 2, tier: 'theatre' });
    const eight = Array.from({ length: 8 }, () => f('error')); // would be -12 -> clamp 0
    expect(rollupScore(eight)).toEqual({ score: 0, tier: 'theatre' });
  });

  it('tier boundaries: 85 solid, 84 at-risk, 50 at-risk, 49 theatre', () => {
    // 1 info+... pick counts to hit exact scores via warnings(6)/info(2)
    // score 85: nothing subtracts to 85 cleanly with weights; assert via direct boundary findings.
    // 100 - 6*2 - 2*2 = 100-16 = 84 (2 warn + 2 info) -> at-risk
    expect(rollupScore([f('warning'), f('warning'), f('info'), f('info')]).tier).toBe('at-risk');
    // 100 - 6*8 - 2 = 100-50 = 50 (8 warn + 1 info) -> at-risk (>=50)
    const fifty = [...Array.from({ length: 8 }, () => f('warning')), f('info')];
    expect(rollupScore(fifty)).toEqual({ score: 50, tier: 'at-risk' });
    // 100 - 6*8 - 2*2 = 100-52 = 48 -> theatre
    const fortyEight = [...Array.from({ length: 8 }, () => f('warning')), f('info'), f('info')];
    expect(rollupScore(fortyEight)).toEqual({ score: 48, tier: 'theatre' });
  });

  it('tierFor: 85 is solid, 84 is at-risk (solid/at-risk boundary)', () => {
    expect(tierFor(85)).toBe('solid');
    expect(tierFor(84)).toBe('at-risk');
  });

  it('is deterministic across repeated calls', () => {
    const input = [f('error'), f('warning')];
    expect(rollupScore(input)).toEqual(rollupScore([...input]));
  });
});
