import { describe, expect, it } from 'vitest';

import {
  decideMembership,
  liveLabelsFromDecisions,
  netSaving,
  DEFAULT_MEMBERSHIP_CONFIG,
  type MembershipConfig,
} from './membership';
import type { MinedTerm } from './mine';

function term(label: string, frequency: number, length: number): MinedTerm {
  return {
    label,
    definition: 'x'.repeat(length),
    length,
    frequency,
    frequencyTimesLength: frequency * length,
    variants: 1,
  };
}

const config: MembershipConfig = { entryThreshold: 200, retirementThreshold: 100, handleCost: 8 };

describe('netSaving', () => {
  it('is positive only when the entry amortizes', () => {
    // freq 5, length 50: 5*(50-8) - 50 = 160 > 0
    expect(netSaving(term('a', 5, 50), 8)).toBe(160);
    // freq 2, length 9: 2*(9-8) - 9 = -7 < 0 (handle barely shorter than span)
    expect(netSaving(term('b', 2, 9), 8)).toBe(-7);
  });
});

describe('decideMembership — measurement-driven', () => {
  it('a new term crossing the entry threshold enters', () => {
    const decisions = decideMembership([term('big', 4, 60)], new Set(), config);
    expect(decisions[0]?.status).toBe('enter'); // score 240 >= 200 and saves
  });

  it('a new term below the entry threshold does not enter', () => {
    const decisions = decideMembership([term('small', 2, 40)], new Set(), config);
    expect(decisions[0]?.status).toBe('retire'); // score 80 < 200
  });

  it('a term that clears the threshold but does not amortize is refused', () => {
    // score = 30 * 9 = 270 >= 200, but netSaving = 30*(9-8)-9 = 21 ... positive.
    // Make handle cost dominate: length 8 -> saving 30*(8-8)-8 = -8 < 0.
    const decisions = decideMembership([term('nosave', 30, 8)], new Set(), {
      ...config,
      entryThreshold: 100,
    });
    expect(decisions[0]?.status).toBe('retire');
  });

  it('a live term is retained in the hysteresis band (below entry, above retire)', () => {
    // score 150: below entry (200) but above retirement (100) -> retained because live.
    const decisions = decideMembership([term('mid', 3, 50)], new Set(['mid']), config);
    expect(decisions[0]?.status).toBe('retain');
  });

  it('a live term whose score decays below the retirement threshold retires', () => {
    // score 80 < retirement 100 -> retire even though live.
    const decisions = decideMembership([term('decayed', 2, 40)], new Set(['decayed']), config);
    expect(decisions[0]?.status).toBe('retire');
  });

  it('a previously-live term absent from the window retires with score 0', () => {
    const decisions = decideMembership([], new Set(['gone']), config);
    expect(decisions).toEqual([
      expect.objectContaining({ label: 'gone', status: 'retire', score: 0, wasLive: true }),
    ]);
  });

  it('liveLabelsFromDecisions returns entered + retained, sorted', () => {
    const decisions = decideMembership(
      [term('big', 4, 60), term('mid', 3, 50)],
      new Set(['mid']),
      config
    );
    expect(liveLabelsFromDecisions(decisions)).toEqual(['big', 'mid']);
  });

  it('has sane defaults', () => {
    expect(DEFAULT_MEMBERSHIP_CONFIG.retirementThreshold).toBeLessThanOrEqual(
      DEFAULT_MEMBERSHIP_CONFIG.entryThreshold
    );
  });
});
