import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DUPLICATION_CONFIG,
  resolveDuplicationConfig,
  isEligibleFile,
} from '../../src/duplication/index';

describe('resolveDuplicationConfig', () => {
  it('applies the Rule-of-Three defaults', () => {
    expect(DEFAULT_DUPLICATION_CONFIG.minTokens).toBe(40);
    expect(DEFAULT_DUPLICATION_CONFIG.minInstances).toBe(3);
    expect(DEFAULT_DUPLICATION_CONFIG.maxClasses).toBe(100);
  });

  it('returns the defaults when given nothing', () => {
    expect(resolveDuplicationConfig()).toEqual(DEFAULT_DUPLICATION_CONFIG);
  });

  it('overrides only the supplied fields', () => {
    const resolved = resolveDuplicationConfig({ minInstances: 2 });
    expect(resolved.minInstances).toBe(2);
    expect(resolved.minTokens).toBe(DEFAULT_DUPLICATION_CONFIG.minTokens);
  });

  it('honours an explicitly empty ignorePatterns rather than falling back to defaults', () => {
    expect(resolveDuplicationConfig({ ignorePatterns: [] }).ignorePatterns).toEqual([]);
  });
});

describe('isEligibleFile', () => {
  const noIgnore = { ignorePatterns: [] as string[] };

  it.each(['a.ts', 'a.tsx', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs'])(
    'accepts the supported extension %s',
    (file) => {
      expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(true);
    }
  );

  it.each(['a.py', 'a.go', 'a.md', 'a.json', 'a.d.ts'])('rejects %s', (file) => {
    expect(isEligibleFile(file, noIgnore.ignorePatterns)).toBe(false);
  });

  it('rejects a file matched by an ignore pattern', () => {
    expect(isEligibleFile('src/generated/gen.ts', ['**/generated/**'])).toBe(false);
  });

  it('rejects test, fixture, and barrel files under the defaults', () => {
    const ignore = DEFAULT_DUPLICATION_CONFIG.ignorePatterns;
    expect(isEligibleFile('src/a.test.ts', ignore)).toBe(false);
    expect(isEligibleFile('tests/fixtures/x/src/a.ts', ignore)).toBe(false);
    expect(isEligibleFile('src/index.ts', ignore)).toBe(false);
    expect(isEligibleFile('src/service.ts', ignore)).toBe(true);
  });
});
