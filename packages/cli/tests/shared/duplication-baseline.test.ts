import { describe, it, expect } from 'vitest';
import {
  buildDuplicationBaseline,
  compareDuplicationBaseline,
  formatDuplicationBaselineLine,
} from '../../src/shared/duplication-baseline';

const cls = (fingerprint: string, memberCount: number, tokenCount = 50) => ({
  fingerprint,
  tokenCount,
  memberCount,
  rank: tokenCount * memberCount,
});

describe('compareDuplicationBaseline', () => {
  const baseline = buildDuplicationBaseline([cls('aaa', 3), cls('bbb', 3)], 0, 'T0');

  it('keys identity on fingerprint:tokenCount, not on the raw count', () => {
    // Same count (2 -> 2), but one class swapped for another: +1 and -1, delta 0.
    const delta = compareDuplicationBaseline(baseline, [cls('aaa', 3), cls('ccc', 3)], 0);
    expect(delta).toMatchObject({ classDelta: 0, added: ['ccc:50'], removed: ['bbb:50'] });
  });

  it('reports a class that gained a copy as grown, with the rank movement', () => {
    const delta = compareDuplicationBaseline(baseline, [cls('aaa', 4), cls('bbb', 3)], 0);
    expect(delta).toMatchObject({ classDelta: 0, grown: ['aaa:50'], rankTotalDelta: 50 });
  });

  it('flags cap churn when either side was truncated', () => {
    expect(compareDuplicationBaseline(baseline, [], 2).capped).toBe(true);
    expect(compareDuplicationBaseline(baseline, [], 0).capped).toBe(false);
  });

  it('renders no-baseline distinctly from a zero delta', () => {
    const none = formatDuplicationBaselineLine({ status: 'no-baseline', path: 'p' });
    const zero = formatDuplicationBaselineLine(
      compareDuplicationBaseline(baseline, [cls('aaa', 3), cls('bbb', 3)], 0)
    );
    expect(none).toContain('no baseline recorded');
    expect(zero).toContain('vs baseline: 0 class(es)');
    expect(zero).toContain('never gates');
  });
});
