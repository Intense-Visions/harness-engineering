import { describe, it, expect } from 'vitest';

/**
 * Registration coverage for criterion 11, extended to Phase 2's surface.
 *
 * Imports the PACKAGE specifier, not the source barrel: a `dist` export
 * regression would stay invisible to `../../src/index`. (This mirrors the
 * choice `tests/duplication/barrel.test.ts` already made in Phase 1.)
 *
 * Every assertion is a RUNTIME one. No tsc project includes test files in this
 * repo, so a type-level assertion here would compile to nothing and prove
 * nothing (roadmap row `typecheck-test-files`).
 */
describe('duplication exports from @harness-engineering/core', () => {
  it('exports detectDuplication', async () => {
    const core = await import('@harness-engineering/core');
    expect(typeof core.detectDuplication).toBe('function');
  });

  it('still exports Phase 1 surface — DuplicationConfig was not lost to an ambiguous star-export', async () => {
    const core = await import('@harness-engineering/core');
    expect(typeof core.buildCloneIndex).toBe('function');
    expect(typeof core.resolveDuplicationConfig).toBe('function');
    // The runtime witness for the DuplicationConfig TYPE: if the barrel had
    // started dropping names, this frozen default would go undefined.
    expect(core.DEFAULT_DUPLICATION_CONFIG).toBeDefined();
    expect(Object.isFrozen(core.DEFAULT_DUPLICATION_CONFIG)).toBe(true);
    expect(core.DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
    expect(core.MAX_EVIDENCE_ENTRIES).toBe(100);
  });

  it('exports detectDuplication from the entropy detectors barrel', async () => {
    const detectors = await import('../../../src/entropy/detectors/index');
    expect(typeof detectors.detectDuplication).toBe('function');
    // The six Phase-0 detectors are untouched (spec criterion 9).
    for (const name of [
      'detectDocDrift',
      'detectDeadCode',
      'detectPatternViolations',
      'detectComplexityViolations',
      'detectCouplingViolations',
      'detectSizeBudgetViolations',
    ]) {
      expect(typeof (detectors as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('exports detectDuplication from the entropy barrel too, as the same function', async () => {
    // The entropy barrel is a CURATED list, so a detector can be registered on
    // `detectors/index.ts` and silently missing from `entropy/index.ts`. Pin
    // that both carry it, and that they carry the SAME binding rather than two
    // separately-resolved module instances.
    const entropy = await import('../../../src/entropy/index');
    const detectors = await import('../../../src/entropy/detectors/index');
    expect(typeof entropy.detectDuplication).toBe('function');
    expect(entropy.detectDuplication).toBe(detectors.detectDuplication);
  });
});
