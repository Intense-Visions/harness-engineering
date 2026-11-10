import { describe, it, expect } from 'vitest';
import { scoreRecovery, rehearsalTierForScore, REHEARSAL_WEIGHTS } from './scoring';
import type { RehearsalManifest, RecoveryRecord } from './types';

const manifest: RehearsalManifest = {
  id: 'hardcoded-secret',
  title: 'Hardcoded API secret in source',
  failureMode: 'leaked-secret',
  difficulty: 'easy',
  summary: 'A live-looking API key is committed directly in source.',
  plantedFile: 'config.ts',
  plantedDescription: 'An API secret is hardcoded as a string literal.',
  expectedCheck: 'harness check-security',
  expectedFix: 'Read the secret from the environment; no literal remains.',
  rubric: {
    detected: 'Agent names the leaked secret.',
    correctCheck: 'Agent runs harness check-security.',
    fixed: 'The literal is gone.',
    noCollateral: 'Sibling files still valid.',
  },
};

/** A textbook clean recovery: detected, right check, fixed, no collateral. */
const goodRecovery: RecoveryRecord = {
  fixtureId: 'hardcoded-secret',
  detected: true,
  identifiedFailureMode: 'leaked-secret',
  checkCited: 'harness check-security',
  fixed: true,
  collateralDamage: false,
};

/** A total miss: nothing detected, no check, not fixed. */
const badRecovery: RecoveryRecord = {
  fixtureId: 'hardcoded-secret',
  detected: false,
  fixed: false,
  collateralDamage: false,
};

describe('rehearsalTierForScore', () => {
  // Table-driven so each boundary input is named in its own test and a shifted
  // threshold reports every input it moved, not just the first.
  it.each([
    [100, 'pass'],
    [80, 'pass'],
    [79, 'partial'],
    [50, 'partial'],
    [49, 'fail'],
    [0, 'fail'],
  ] as const)('maps score %i to tier "%s"', (score, tier) => {
    expect(rehearsalTierForScore(score)).toBe(tier);
  });
});

describe('scoreRecovery', () => {
  it('scores 100 and tier "pass" when every dimension is credited', () => {
    const s = scoreRecovery(manifest, goodRecovery);
    // Pin the full dimension set: an empty or partial `dimensions` array, or a
    // dropped dimension, fails here and the diff names the offending dimension.
    expect(Object.fromEntries(s.dimensions.map((d) => [d.name, d.credited]))).toEqual({
      detected: true,
      correctCheck: true,
      fixed: true,
      noCollateral: true,
    });
    expect(s).toMatchObject({ score: 100, tier: 'pass' });
  });

  it('echoes the manifest fixtureId and failureMode onto the score', () => {
    // The record deliberately names a DIFFERENT fixture and failure mode, so only
    // values taken from the manifest can satisfy the assertion.
    const s = scoreRecovery(manifest, {
      ...goodRecovery,
      fixtureId: 'some-other-fixture',
      identifiedFailureMode: 'layer-violation',
    });
    expect(s).toMatchObject({ fixtureId: 'hardcoded-secret', failureMode: 'leaked-secret' });
  });

  it('awards only the noCollateral weight and tier "fail" when the agent neither detected, checked, nor fixed the defect', () => {
    const s = scoreRecovery(manifest, badRecovery);
    // Nothing detected/fixed/checked, but no collateral damage was introduced.
    expect(Object.fromEntries(s.dimensions.map((d) => [d.name, d.credited]))).toEqual({
      detected: false,
      correctCheck: false,
      fixed: false,
      noCollateral: true,
    });
    expect(s).toMatchObject({ score: REHEARSAL_WEIGHTS.noCollateral, tier: 'fail' });
  });

  it('withholds detection credit for a confident misdiagnosis', () => {
    const s = scoreRecovery(manifest, {
      ...goodRecovery,
      identifiedFailureMode: 'layer-violation',
    });
    const detected = s.dimensions.find((d) => d.name === 'detected');
    expect(detected?.credited).toBe(false);
    // 100 - detected weight (30) = 70.
    expect(s.score).toBe(100 - REHEARSAL_WEIGHTS.detected);
    expect(s.tier).toBe('partial');
  });

  it('trusts the detected boolean when no failure mode is named', () => {
    const s = scoreRecovery(manifest, {
      ...goodRecovery,
      identifiedFailureMode: undefined,
    });
    expect(s.dimensions.find((d) => d.name === 'detected')?.credited).toBe(true);
    expect(s.score).toBe(100);
  });

  it('credits correctCheck when the harness prefix is omitted', () => {
    const s = scoreRecovery(manifest, { ...goodRecovery, checkCited: 'check-security' });
    expect(s.dimensions.find((d) => d.name === 'correctCheck')?.credited).toBe(true);
  });

  it('withholds correctCheck credit for the wrong check', () => {
    const s = scoreRecovery(manifest, { ...goodRecovery, checkCited: 'harness check-docs' });
    expect(s.dimensions.find((d) => d.name === 'correctCheck')?.credited).toBe(false);
    expect(s.score).toBe(100 - REHEARSAL_WEIGHTS.correctCheck);
  });

  describe('correctCheck citation containment (no reverse leniency)', () => {
    const archManifest: RehearsalManifest = { ...manifest, expectedCheck: 'harness check-arch' };
    const archRecovery: RecoveryRecord = { ...goodRecovery, checkCited: 'harness check-arch' };

    it('does NOT credit a bare/short citation that is merely a substring of the expected check', () => {
      const s = scoreRecovery(archManifest, { ...archRecovery, checkCited: 'check' });
      expect(s.dimensions.find((d) => d.name === 'correctCheck')?.credited).toBe(false);
    });

    it('credits the full check token with the harness prefix', () => {
      const s = scoreRecovery(archManifest, { ...archRecovery, checkCited: 'harness check-arch' });
      expect(s.dimensions.find((d) => d.name === 'correctCheck')?.credited).toBe(true);
    });

    it('credits the full check token when the harness prefix is omitted', () => {
      const s = scoreRecovery(archManifest, { ...archRecovery, checkCited: 'check-arch' });
      expect(s.dimensions.find((d) => d.name === 'correctCheck')?.credited).toBe(true);
    });
  });

  it('penalises collateral damage even on an otherwise clean fix', () => {
    const s = scoreRecovery(manifest, { ...goodRecovery, collateralDamage: true });
    expect(s.dimensions.find((d) => d.name === 'noCollateral')?.credited).toBe(false);
    expect(s.score).toBe(100 - REHEARSAL_WEIGHTS.noCollateral);
    expect(s.tier).toBe('pass'); // 85 is still a pass
  });

  it('scores a detect-but-not-fix recovery as partial', () => {
    const s = scoreRecovery(manifest, { ...goodRecovery, fixed: false });
    // detected (30) + correctCheck (20) + noCollateral (15) = 65.
    expect(s.score).toBe(65);
    expect(s.tier).toBe('partial');
  });
});
