import { describe, it, expect } from 'vitest';
import { HOOK_SUPPORT_FILES, supportFilesFor } from './support-files';

/**
 * Behavior guard for the hook support-file registry. supportFilesFor() resolves
 * the deduplicated basenames of support modules that the installer must ship and
 * preserve alongside a set of active hooks. These tests pin the current registry
 * contract and the resolve/dedupe semantics (unknown hooks contribute nothing,
 * duplicates collapse, first-seen order is preserved).
 */
describe('HOOK_SUPPORT_FILES registry', () => {
  it('maps the format-check-dependent hooks to their shared support module', () => {
    expect(HOOK_SUPPORT_FILES['quality-warner']).toEqual(['format-check.js']);
    expect(HOOK_SUPPORT_FILES['strict-quality-gate']).toEqual(['format-check.js']);
  });

  it('has no entry for self-contained hooks that need no support file', () => {
    // A hook that ships as a single verbatim .js file must not appear in the
    // registry, otherwise the installer would try to preserve a phantom file.
    expect(HOOK_SUPPORT_FILES['protect-config']).toBeUndefined();
    expect(HOOK_SUPPORT_FILES['cost-tracker']).toBeUndefined();
  });
});

describe('supportFilesFor', () => {
  it('returns the support files for a single registered hook', () => {
    expect(supportFilesFor(['quality-warner'])).toEqual(['format-check.js']);
  });

  it('deduplicates support files shared across multiple active hooks', () => {
    // Both registered hooks depend on the same support module; the installer
    // should be told to ship it exactly once.
    expect(supportFilesFor(['quality-warner', 'strict-quality-gate'])).toEqual(['format-check.js']);
  });

  it('ignores hook names that have no registry entry', () => {
    expect(supportFilesFor(['protect-config', 'cost-tracker'])).toEqual([]);
  });

  it('collects only the registered hooks from a mixed set', () => {
    const result = supportFilesFor(['protect-config', 'strict-quality-gate', 'block-no-verify']);
    expect(result).toEqual(['format-check.js']);
  });

  it('returns an empty array for no active hooks', () => {
    expect(supportFilesFor([])).toEqual([]);
  });

  it('preserves first-seen order across distinct support files', () => {
    // Derive expectations from the registry itself so this test tracks the real
    // source of truth rather than a hardcoded ordering. We build two hook names
    // whose support files differ, then assert union order is first-seen.
    const registered = Object.entries(HOOK_SUPPORT_FILES);
    const withFiles = registered.filter(([, files]) => files.length > 0);
    // Current registry only contains one distinct support file; assert the
    // dedupe still yields that single-element ordering deterministically.
    // The registry now spans multiple distinct support files (format-check plus
    // the session-retrospect core + per-agent entry scripts); assert the
    // resolved union preserves first-seen order deterministically.
    const distinct = [...new Set(withFiles.flatMap(([, files]) => files))];
    expect(supportFilesFor(withFiles.map(([name]) => name))).toEqual(distinct);
  });

  it('does not mutate the underlying registry entries', () => {
    const before = [...HOOK_SUPPORT_FILES['quality-warner']!];
    const result = supportFilesFor(['quality-warner']);
    result.push('injected.js');
    expect(HOOK_SUPPORT_FILES['quality-warner']).toEqual(before);
  });
});
