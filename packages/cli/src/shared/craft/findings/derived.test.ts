import { describe, it, expect } from 'vitest';
import type { Tier, Impact, Confidence } from './axes.js';
import { derivePriority } from './derived.js';

// Axis domains, mirrored from ./axes.ts. Kept as local constants so the
// exhaustive/monotonicity assertions below are derived from the full domain
// rather than hardcoded literals.
const TIERS: Tier[] = ['foundational', 'polish', 'aspirational'];
const IMPACTS: Impact[] = ['small', 'medium', 'large'];
const CONFIDENCES: Confidence[] = ['high', 'medium', 'low'];

// Reference weights from the SUT's documented MVP rule:
//   priority = TIER_BAND[tier] + IMPACT_WEIGHT[impact] * CONFIDENCE_WEIGHT[confidence]
const TIER_BAND: Record<Tier, number> = {
  foundational: 1000,
  polish: 100,
  aspirational: 10,
};
const IMPACT_WEIGHT: Record<Impact, number> = { large: 9, medium: 6, small: 3 };
const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 5, medium: 3, low: 1 };

function expected(tier: Tier, impact: Impact, confidence: Confidence): number {
  return TIER_BAND[tier] + IMPACT_WEIGHT[impact] * CONFIDENCE_WEIGHT[confidence];
}

describe('derivePriority', () => {
  it('applies band + impact*confidence for a representative case', () => {
    // foundational band (1000) + large(9) * high(5) = 1000 + 45 = 1045
    expect(derivePriority('foundational', 'large', 'high')).toBe(1045);
  });

  it('matches the documented formula across every axis combination', () => {
    for (const tier of TIERS) {
      for (const impact of IMPACTS) {
        for (const confidence of CONFIDENCES) {
          expect(derivePriority(tier, impact, confidence)).toBe(expected(tier, impact, confidence));
        }
      }
    }
  });

  it('keeps the tier band dominant: worst within-band never outranks best of a lower band', () => {
    // The band gap (order-of-magnitude) must exceed the widest within-band
    // score spread, so ANY higher-tier finding outranks ANY lower-tier one.
    const minWithinBand = Math.min(
      ...IMPACTS.flatMap((impact) =>
        CONFIDENCES.map((c) => IMPACT_WEIGHT[impact] * CONFIDENCE_WEIGHT[c])
      )
    );
    const maxWithinBand = Math.max(
      ...IMPACTS.flatMap((impact) =>
        CONFIDENCES.map((c) => IMPACT_WEIGHT[impact] * CONFIDENCE_WEIGHT[c])
      )
    );

    // foundational/small/low outranks any polish finding
    for (const impact of IMPACTS) {
      for (const confidence of CONFIDENCES) {
        expect(derivePriority('foundational', 'small', 'low')).toBeGreaterThan(
          derivePriority('polish', impact, confidence)
        );
        // polish/small/low outranks any aspirational finding
        expect(derivePriority('polish', 'small', 'low')).toBeGreaterThan(
          derivePriority('aspirational', impact, confidence)
        );
      }
    }

    // Sanity: the guarantee only holds because the band step (>= 90) exceeds
    // the within-band spread.
    expect(TIER_BAND.polish - TIER_BAND.aspirational).toBeGreaterThan(
      maxWithinBand - minWithinBand
    );
  });

  it('is monotonic in impact (confidence and tier fixed)', () => {
    for (const tier of TIERS) {
      for (const confidence of CONFIDENCES) {
        expect(derivePriority(tier, 'small', confidence)).toBeLessThan(
          derivePriority(tier, 'medium', confidence)
        );
        expect(derivePriority(tier, 'medium', confidence)).toBeLessThan(
          derivePriority(tier, 'large', confidence)
        );
      }
    }
  });

  it('is monotonic in confidence (impact and tier fixed)', () => {
    for (const tier of TIERS) {
      for (const impact of IMPACTS) {
        expect(derivePriority(tier, impact, 'low')).toBeLessThan(
          derivePriority(tier, impact, 'medium')
        );
        expect(derivePriority(tier, impact, 'medium')).toBeLessThan(
          derivePriority(tier, impact, 'high')
        );
      }
    }
  });

  it('always returns a positive number', () => {
    for (const tier of TIERS) {
      for (const impact of IMPACTS) {
        for (const confidence of CONFIDENCES) {
          expect(derivePriority(tier, impact, confidence)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is a pure function: identical inputs yield identical output', () => {
    const first = derivePriority('polish', 'medium', 'medium');
    const second = derivePriority('polish', 'medium', 'medium');
    expect(second).toBe(first);
  });
});
