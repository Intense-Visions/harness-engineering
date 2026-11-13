// packages/core/tests/hooks/skill-availability.test.ts
//
// THE PARITY LAW. This is what makes `skill-availability.ts` load-bearing
// rather than merely present: the two review hosts must agree on what
// "installed" means, and a SINGLE mutation in the shared module must redden
// BOTH halves. A mutant that reddens only one proves the other host kept a
// private copy — the half-fix shape.
//
// Both halves probe with a PREDICATE, deliberately. An enumerable catalog
// (Set/array) is normalized by `bareSkillName`, so qualification depth is
// irrelevant there and a Set-based test does NOT exercise `probeForms` at all.
// Measured: craft-review-hooks.test.ts's deep-form case passes a Set, so it is
// blind to the probe-form list. The predicate path is the only one where the
// form list IS the coverage.
import { describe, it, expect } from 'vitest';
import { planCanaryReviewDetectors, planCraftReviewDomains } from '../../src/hooks';

/** The form a live Claude Code catalog reports, per host plugin prefix. */
const QUALIFIED = (prefix: string, s: string) => `${prefix}skills:claude-code:${s}:${s}`;

describe('skill availability is resolved identically for both hosts', () => {
  it('canary wires a detector reported only in the deep plugin-qualified form', () => {
    const deep = (s: string) => s === QUALIFIED('canary:', 'canary-cassandra');
    const plan = planCanaryReviewDetectors(true, 'after:REVIEW', deep);
    expect(plan.wired.map((h) => h.type === 'skill' && h.skill)).toContain('canary-cassandra');
  });

  it('craft wires a domain reported only in the deep plugin-qualified form', () => {
    const deep = (s: string) => s === QUALIFIED('harness-claude:', 'code-craft');
    const plan = planCraftReviewDomains('harness-autopilot', 'after:REVIEW', ['src/a.ts'], deep);
    expect(plan.wired.map((h) => h.type === 'skill' && h.skill)).toContain('code-craft');
  });

  // POSITIVE CONTROL FOR BOTH CASES ABOVE. Without it, a predicate that
  // answered TRUE for everything would satisfy them, and so would a resolver
  // that ignored availability entirely. `undefined` must install nothing: an
  // unknown catalog is never optimistically wired.
  it('an unknown catalog installs nothing, for both hosts', () => {
    expect(planCanaryReviewDetectors(true, 'after:REVIEW', undefined).wired).toHaveLength(0);
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:REVIEW', ['src/a.ts'], undefined).wired
    ).toHaveLength(0);
  });

  // The second positive control: the deep form must be the ONLY thing those
  // predicates matched. If the bare name also wired, the deep-form cases above
  // would pass without the probe-form list doing any work.
  it('a predicate that recognizes NOTHING wires nothing, for both hosts', () => {
    const none = () => false;
    expect(planCanaryReviewDetectors(true, 'after:REVIEW', none).wired).toHaveLength(0);
    expect(
      planCraftReviewDomains('harness-autopilot', 'after:REVIEW', ['src/a.ts'], none).wired
    ).toHaveLength(0);
  });
});
