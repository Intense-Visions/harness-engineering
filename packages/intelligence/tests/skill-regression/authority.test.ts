import { describe, it, expect } from 'vitest';
import { deriveRegressionAuthority } from '../../src/skill-regression/authority.js';

describe('deriveRegressionAuthority', () => {
  it('blocks ONLY on a high-confidence REGRESSED', () => {
    expect(deriveRegressionAuthority('REGRESSED', 'high')).toBe('blocking');
  });

  it('is advisory for a low/medium-confidence REGRESSED', () => {
    expect(deriveRegressionAuthority('REGRESSED', 'medium')).toBe('advisory');
    expect(deriveRegressionAuthority('REGRESSED', 'low')).toBe('advisory');
  });

  it('is advisory for every STABLE and INCONCLUSIVE verdict', () => {
    for (const c of ['low', 'medium', 'high'] as const) {
      expect(deriveRegressionAuthority('STABLE', c)).toBe('advisory');
      expect(deriveRegressionAuthority('INCONCLUSIVE', c)).toBe('advisory');
    }
  });
});
