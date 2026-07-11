import { describe, it, expect } from 'vitest';
import type { BackendCapabilities, BackendCapabilityRegistry } from '@harness-engineering/types';
import { selectCheapestQualifying, PrivacyNoMatch } from './capability-registry.js';

const cap = (
  o: Partial<BackendCapabilities> & Pick<BackendCapabilities, 'tier' | 'costPer1kTokens'>
): BackendCapabilities => ({
  privacyClass: 'shared-cloud',
  contextWindow: 128_000,
  ...o,
});

const cloudOnly: BackendCapabilityRegistry = new Map([
  ['haiku', cap({ tier: 'fast', costPer1kTokens: 0.25, privacyClass: 'shared-cloud' })],
  ['sonnet', cap({ tier: 'standard', costPer1kTokens: 3, privacyClass: 'shared-cloud' })],
  ['opus', cap({ tier: 'strong', costPer1kTokens: 15, privacyClass: 'shared-cloud' })],
]);

describe('selectCheapestQualifying — SC3 (cloud-only, no local branch)', () => {
  it('routes fast → a fast-tier cloud backend', () => {
    expect(selectCheapestQualifying(cloudOnly, 'fast', {})?.name).toBe('haiku');
  });
  it('routes strong → a strong-tier cloud backend', () => {
    expect(selectCheapestQualifying(cloudOnly, 'strong', {})?.name).toBe('opus');
  });
});

describe('selectCheapestQualifying — fail-closed distinguishability', () => {
  it('returns undefined when only tier/cost excludes all (best-effort)', () => {
    const fastOnly: BackendCapabilityRegistry = new Map([
      ['haiku', cap({ tier: 'fast', costPer1kTokens: 0.25 })],
    ]);
    expect(selectCheapestQualifying(fastOnly, 'strong', {})).toBeUndefined();
  });
  it('throws PrivacyNoMatch when privacy floor excludes all (fail closed)', () => {
    expect(() =>
      selectCheapestQualifying(cloudOnly, 'fast', { privacyFloor: 'on-device' })
    ).toThrow(PrivacyNoMatch);
  });
  it('throws PrivacyNoMatch when the allowlist excludes all (fail closed)', () => {
    // allowlist uses backend provider type carried on the capability entry
    expect(() => selectCheapestQualifying(cloudOnly, 'fast', { allowed: [] })).toThrow(
      PrivacyNoMatch
    );
  });
});
