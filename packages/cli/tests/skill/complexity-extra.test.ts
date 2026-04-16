import { describe, it, expect } from 'vitest';
import { evaluateSignals } from '../../src/skill/complexity';

describe('evaluateSignals — additional branches', () => {
  it('returns fast for docsOnly with 1 file', () => {
    expect(
      evaluateSignals({
        fileCount: 1,
        testOnly: false,
        docsOnly: true,
        newDir: false,
        newDep: false,
      })
    ).toBe('fast');
  });

  it('returns thorough for 2 files that are not test-only or docs-only', () => {
    expect(
      evaluateSignals({
        fileCount: 2,
        testOnly: false,
        docsOnly: false,
        newDir: false,
        newDep: false,
      })
    ).toBe('thorough');
  });

  it('returns fast for 0 files', () => {
    expect(
      evaluateSignals({
        fileCount: 0,
        testOnly: false,
        docsOnly: false,
        newDir: false,
        newDep: false,
      })
    ).toBe('fast');
  });

  it('returns thorough for 3+ files even if testOnly', () => {
    // fileCount >= 3 triggers thorough before testOnly is checked
    expect(
      evaluateSignals({
        fileCount: 3,
        testOnly: true,
        docsOnly: false,
        newDir: false,
        newDep: false,
      })
    ).toBe('thorough');
  });

  it('returns thorough when newDep with 2 files', () => {
    expect(
      evaluateSignals({
        fileCount: 2,
        testOnly: false,
        docsOnly: false,
        newDir: false,
        newDep: true,
      })
    ).toBe('thorough');
  });

  it('returns fast for testOnly with 2 files', () => {
    // 2 files + testOnly: fileCount check (>=3) not triggered, newDir/newDep not set
    // Then fileCount <= 1 check fails, but testOnly is checked next
    expect(
      evaluateSignals({
        fileCount: 2,
        testOnly: true,
        docsOnly: false,
        newDir: false,
        newDep: false,
      })
    ).toBe('fast');
  });

  it('returns fast for docsOnly with 2 files', () => {
    expect(
      evaluateSignals({
        fileCount: 2,
        testOnly: false,
        docsOnly: true,
        newDir: false,
        newDep: false,
      })
    ).toBe('fast');
  });
});
