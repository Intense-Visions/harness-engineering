import { describe, it, expect } from 'vitest';
import { classifyBaseFreshness } from '../../src/ci/base-freshness';

const TESTED = 'aaaaaaa1111111111111111111111111111111';
const CURRENT = 'bbbbbbb2222222222222222222222222222222';

describe('classifyBaseFreshness (issue #1294 base-freshness clause)', () => {
  it('trusts green as verified when strict/up-to-date-before-merge is enforced, even if the base advanced', () => {
    const verdict = classifyBaseFreshness({
      testedBaseSha: TESTED,
      currentBaseSha: CURRENT,
      baseAdvancedSinceTest: true,
      strictRequired: true,
    });

    expect(verdict.trust).toBe('verified');
    expect(verdict.fresh).toBe(true);
    expect(verdict.reason).toMatch(/strict|up-to-date/i);
  });

  it('trusts green as verified when the base has not advanced since CI ran', () => {
    const verdict = classifyBaseFreshness({
      testedBaseSha: TESTED,
      currentBaseSha: TESTED,
      baseAdvancedSinceTest: false,
      strictRequired: false,
    });

    expect(verdict.trust).toBe('verified');
    expect(verdict.fresh).toBe(true);
  });

  it('downgrades stale green to degraded when the base advanced under strict=false (the #1294 failure)', () => {
    const verdict = classifyBaseFreshness({
      testedBaseSha: TESTED,
      currentBaseSha: CURRENT,
      baseAdvancedSinceTest: true,
      strictRequired: false,
    });

    expect(verdict.trust).toBe('degraded');
    expect(verdict.fresh).toBe(false);
  });

  it('names the stale tested base SHA and current main SHA in the degraded reason (for the report)', () => {
    const verdict = classifyBaseFreshness({
      testedBaseSha: TESTED,
      currentBaseSha: CURRENT,
      baseAdvancedSinceTest: true,
      strictRequired: false,
    });

    // Short (7-char) forms of both SHAs appear so the batch report can name
    // "stale base SHA vs current main".
    expect(verdict.reason).toContain(TESTED.slice(0, 7));
    expect(verdict.reason).toContain(CURRENT.slice(0, 7));
  });
});
