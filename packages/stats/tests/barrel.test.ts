import { readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as stats from '../src/index';

/**
 * Proves the source barrel of the new leaf package, not the built artifact:
 * `../src/index` resolves under vitest, and its export key-set is exactly the
 * Phase 1 instrument set (spec D6: one directory per instrument, exported as
 * one namespace). The second test pins SC12 on the filesystem itself: `src/`
 * holds only the barrel plus one directory per instrument, and each
 * instrument directory holds only its own barrel.
 */
describe('@harness-engineering/stats barrel', () => {
  it('exports exactly the instruments that ship in this phase, each as a namespace object', () => {
    expect(Object.keys(stats).sort()).toEqual(['bandit', 'sprt']);
    for (const instrument of [stats.bandit, stats.sprt]) {
      expect(typeof instrument).toBe('object');
      expect(instrument).not.toBeNull();
    }
  });

  it('lays out src/ as one barrel plus one directory per instrument (SC12)', () => {
    const src = path.resolve(__dirname, '../src');
    expect(readdirSync(src).sort()).toEqual(['bandit', 'index.ts', 'sprt']);
    expect(readdirSync(path.join(src, 'bandit'))).toEqual(['index.ts']);
    expect(readdirSync(path.join(src, 'sprt'))).toEqual(['index.ts']);
  });
});
