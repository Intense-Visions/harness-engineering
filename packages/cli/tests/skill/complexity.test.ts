// packages/cli/tests/skill/complexity.test.ts
import { describe, it, expect } from 'vitest';
import { detectComplexity, evaluateSignals } from '../../src/skill/complexity';

describe('detectComplexity', () => {
  it('returns full as default when no git context', () => {
    // Non-git directory
    const result = detectComplexity('/tmp/not-a-repo');
    expect(result).toBe('thorough');
  });

  it('returns fast|thorough based on signal detection', () => {
    expect(
      evaluateSignals({
        fileCount: 1,
        testOnly: false,
        docsOnly: false,
        newDir: false,
        newDep: false,
      })
    ).toBe('fast');
    expect(
      evaluateSignals({
        fileCount: 5,
        testOnly: false,
        docsOnly: false,
        newDir: false,
        newDep: false,
      })
    ).toBe('thorough');
    expect(
      evaluateSignals({
        fileCount: 1,
        testOnly: true,
        docsOnly: false,
        newDir: false,
        newDep: false,
      })
    ).toBe('fast');
    expect(
      evaluateSignals({
        fileCount: 1,
        testOnly: false,
        docsOnly: false,
        newDir: true,
        newDep: false,
      })
    ).toBe('thorough');
    expect(
      evaluateSignals({
        fileCount: 1,
        testOnly: false,
        docsOnly: false,
        newDir: false,
        newDep: true,
      })
    ).toBe('thorough');
  });
});
