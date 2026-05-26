import { describe, it, expect } from 'vitest';
import { extractTests } from '../../src/test-craft/extract/tests';

describe('extractTests', () => {
  it('extracts simple it(name, fn)', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `import { describe, it } from 'vitest';\n\nit('returns null', () => { expect(x).toBe(null); });\n`,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].testName).toBe('returns null');
    expect(tests[0].nesting).toEqual([]);
    expect(tests[0].framework).toBe('vitest');
    expect(tests[0].skipped).toBe(false);
    expect(tests[0].todo).toBe(false);
  });

  it('extracts test(name, fn) (alias for it)', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `test('does X', () => {});`,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].testName).toBe('does X');
  });

  it('captures nesting chain from enclosing describe blocks', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `
        describe('A', () => {
          describe('B', () => {
            it('c', () => {});
          });
        });
      `,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].nesting).toEqual(['A', 'B']);
    expect(tests[0].testName).toBe('c');
  });

  it('marks .skip with skipped=true', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `it.skip('disabled', () => {});`,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].skipped).toBe(true);
  });

  it('marks .todo with todo=true (empty body)', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `it.todo('not implemented yet');`,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].todo).toBe(true);
    expect(tests[0].body).toBe('');
  });

  it('marks .only with only=true', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `it.only('focused', () => {});`,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].only).toBe(true);
  });

  it('captures callback body text', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `it('x', () => { const a = 1; expect(a).toBe(1); });`,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(1);
    expect(tests[0].body).toContain('const a = 1');
    expect(tests[0].body).toContain('expect(a).toBe(1)');
  });

  it('skips non-string-literal test names silently', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `const name = 'dynamic'; it(name, () => {});`,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(0);
  });

  it('returns [] for non-test files', () => {
    const tests = extractTests({
      file: 'foo.ts',
      source: `it('x', () => {});`,
      framework: 'vitest',
    });
    expect(tests).toEqual([]);
  });

  it('records line numbers (1-indexed)', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `// line 1\n// line 2\nit('a', () => {});\n`,
      framework: 'vitest',
    });
    expect(tests[0].line).toBe(3);
  });

  it('extracts multiple sibling tests', () => {
    const tests = extractTests({
      file: 'foo.test.ts',
      source: `
        describe('S', () => {
          it('a', () => {});
          it('b', () => {});
          it('c', () => {});
        });
      `,
      framework: 'vitest',
    });
    expect(tests).toHaveLength(3);
    expect(tests.map((t) => t.testName)).toEqual(['a', 'b', 'c']);
    expect(tests.every((t) => t.nesting[0] === 'S')).toBe(true);
  });
});
