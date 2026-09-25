import { readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import * as stats from '../src/index';

/**
 * Proves the source barrel of the new leaf package, not the built artifact:
 * `../src/index` resolves under vitest, and its export key-set is exactly the
 * Phase 1 instrument set (spec D6: one directory per instrument, exported as
 * one namespace). The second test pins SC12 on the filesystem itself: `src/`
 * holds only the barrel plus one directory per instrument; the `bandit` and
 * `sprt` listings and export keys are pinned to their Phase 2 and Phase 3
 * surfaces.
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
    expect(readdirSync(path.join(src, 'bandit')).sort()).toEqual([
      'arm-model.ts',
      'config.ts',
      'errors.ts',
      'index.ts',
      'ledger-parse.ts',
      'ledger.ts',
      'policy.ts',
      'sampling.ts',
      'utility.ts',
    ]);
    expect(readdirSync(path.join(src, 'sprt')).sort()).toEqual([
      'config.ts',
      'errors.ts',
      'index.ts',
      'sprt.ts',
    ]);
  });

  it('bandit exposes exactly the Phase 2 public surface', () => {
    expect(Object.keys(stats.bandit).sort()).toEqual([
      'BanditLedger',
      'COST_EPSILON_USD',
      'DEFAULT_HALF_LIFE_DAYS',
      'DEFAULT_LEDGER_PATH',
      'DEFAULT_MIN_EFFECTIVE_N',
      'DEFAULT_PRIOR',
      'DEFAULT_SCOUT_FRACTION',
      'InvalidBanditConfigError',
      'NoEligibleArmsError',
      'choose',
      'decayWeight',
      'foldArms',
      'outcomeOnly',
      'outcomePerDollar',
      'resolveBanditConfig',
    ]);
    expect(typeof stats.bandit.choose).toBe('function');
    expect(typeof stats.bandit.BanditLedger).toBe('function');
  });

  it('sprt exposes exactly the Phase 3 public surface', () => {
    expect(Object.keys(stats.sprt).sort()).toEqual([
      'InvalidSprtConfigError',
      'InvalidSprtObservationError',
      'createSprt',
      'validateSprtConfig',
      'waldBounds',
    ]);
    expect(typeof stats.sprt.createSprt).toBe('function');
    expect(typeof stats.sprt.waldBounds).toBe('function');
  });
});
