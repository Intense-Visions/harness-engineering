import { describe, it, expect } from 'vitest';
import { extractPRDescriptions } from '../../src/copy-craft/extract/pr-descriptions';

describe('extractPRDescriptions — graceful degradation', () => {
  // The shell-out happens inside the function; in test we can't reliably
  // mock execSync without bigger refactor. We assert the graceful-degradation
  // contract on the result shape: either skipReason is set, or items is
  // non-null. Both are acceptable v1 behaviour.
  it('returns either items or a skipReason (graceful contract)', () => {
    const result = extractPRDescriptions({ projectRoot: process.cwd() });
    expect(Array.isArray(result.items)).toBe(true);
    if (result.skipReason !== undefined) {
      expect(typeof result.skipReason).toBe('string');
      expect(result.skipReason.length).toBeGreaterThan(0);
    }
  });
});
