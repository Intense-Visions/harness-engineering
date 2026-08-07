import { describe, it, expect } from 'vitest';
import { deriveExitCode } from '../../src/deployment/exit-code';
import type { DeploymentGateResult } from '../../src/deployment/types';

const r = (status: DeploymentGateResult['status']): DeploymentGateResult => ({
  status,
  findings: [],
  hardViolations: [],
  softViolations: [],
  detectedEnvironments: [],
  rollbackPathPresent: false,
});

describe('deriveExitCode (D2)', () => {
  it('pass → 0', () => expect(deriveExitCode(r('pass'))).toBe(0));
  it('disabled → 0', () => expect(deriveExitCode(r('disabled'))).toBe(0));
  it('blocked → 1', () => expect(deriveExitCode(r('blocked'))).toBe(1));
  it('abstained → 3 (ZERO_DENOMINATOR)', () => expect(deriveExitCode(r('abstained'))).toBe(3));
});
