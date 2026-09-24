import { describe, expect, it } from 'vitest';

import * as stats from '../src/index';

/**
 * Proves the build/test wiring of the new leaf package end to end: the barrel
 * resolves, and each instrument is exposed as a namespace object (spec D6:
 * one directory per instrument, exported as one namespace).
 */
describe('@harness-engineering/stats barrel', () => {
  it('exposes the bandit instrument as a namespace', () => {
    expect(typeof stats.bandit).toBe('object');
    expect(stats.bandit).not.toBeNull();
  });

  it('exposes the sprt instrument as a namespace', () => {
    expect(typeof stats.sprt).toBe('object');
    expect(stats.sprt).not.toBeNull();
  });

  it('exports exactly the instruments that ship in this phase (SC12)', () => {
    expect(Object.keys(stats).sort()).toEqual(['bandit', 'sprt']);
  });
});
