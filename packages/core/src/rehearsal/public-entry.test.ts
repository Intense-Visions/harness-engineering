import { describe, it, expect } from 'vitest';
import { rehearsalTierFor, rehearsalTierForScore } from '../index';

/**
 * Guards D4/D5: `packages/core/src/rehearsal/index.ts` is a *named* export list,
 * not `export *`. A symbol declared in `scoring.ts` but omitted from that list
 * compiles, passes every direct-import test, and is still absent from the
 * published package surface. Only an import through the public entry
 * (`scoring.ts` -> `rehearsal/index.ts` -> `core/index.ts`) exercises that chain.
 */
describe('rehearsal public entry surface', () => {
  it('exports rehearsalTierForScore from the package public entry', () => {
    expect(typeof rehearsalTierForScore).toBe('function');
    expect(rehearsalTierForScore(80)).toBe('pass');
    expect(rehearsalTierForScore(50)).toBe('partial');
    expect(rehearsalTierForScore(49)).toBe('fail');
  });

  it('keeps the deprecated rehearsalTierFor alias reachable from the public entry', () => {
    expect(typeof rehearsalTierFor).toBe('function');
  });

  it('resolves both names to the identical function reference', () => {
    expect(rehearsalTierFor).toBe(rehearsalTierForScore);
  });
});
