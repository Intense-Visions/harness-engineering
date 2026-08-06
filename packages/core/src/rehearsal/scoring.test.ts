import { describe, it, expect } from 'vitest';
import { scoreRecovery, rehearsalTierFor, REHEARSAL_WEIGHTS } from './scoring';
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

describe('rehearsalTierFor', () => {
  it('maps score bands to tiers at the boundaries', () => {
    expect(rehearsalTierFor(100)).toBe('pass');
    expect(rehearsalTierFor(80)).toBe('pass');
    expect(rehearsalTierFor(79)).toBe('partial');
    expect(rehearsalTierFor(50)).toBe('partial');
    expect(rehearsalTierFor(49)).toBe('fail');
    expect(rehearsalTierFor(0)).toBe('fail');
  });
});

describe('scoreRecovery', () => {
  it('scores a known-good recovery at 100 / pass', () => {
    const s = scoreRecovery(manifest, goodRecovery);
    expect(s.score).toBe(100);
    expect(s.tier).toBe('pass');
    expect(s.fixtureId).toBe('hardcoded-secret');
    expect(s.failureMode).toBe('leaked-secret');
    expect(s.dimensions.every((d) => d.credited)).toBe(true);
  });

  it('scores a known-bad recovery low / fail (only noCollateral credited)', () => {
    const s = scoreRecovery(manifest, badRecovery);
    // Nothing detected/fixed/checked, but no collateral damage was introduced.
    expect(s.score).toBe(REHEARSAL_WEIGHTS.noCollateral);
    expect(s.tier).toBe('fail');
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
