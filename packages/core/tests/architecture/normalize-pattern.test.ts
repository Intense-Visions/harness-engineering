import { describe, it, expect } from 'vitest';
import {
  normalizeViolationPattern,
  extractDirectoryScope,
} from '../../src/architecture/normalize-pattern';
import type { Violation } from '../../src/architecture/types';

function makeViolation(category: string, detail: string, file: string = 'src/foo.ts'): Violation {
  return {
    id: 'test-id',
    file,
    category: category as Violation['category'],
    detail,
    severity: 'error',
  };
}

describe('normalizeViolationPattern', () => {
  it('extracts layer pair from layer-violation detail', () => {
    const v = makeViolation(
      'layer-violations',
      'core -> cli: src/core/foo.ts imports src/cli/bar.ts'
    );
    expect(normalizeViolationPattern(v)).toBe('core -> cli');
  });

  it('extracts layer pair from layer-violation with different layers', () => {
    const v = makeViolation(
      'layer-violations',
      'types -> graph: packages/types/src/a.ts imports packages/graph/src/b.ts'
    );
    expect(normalizeViolationPattern(v)).toBe('types -> graph');
  });

  it('normalizes circular-deps by stripping file paths', () => {
    const v = makeViolation('circular-deps', 'src/a.ts -> src/b.ts -> src/a.ts');
    expect(normalizeViolationPattern(v)).toBe('circular-dep-cycle');
  });

  it('normalizes complexity violations to category type', () => {
    const v = makeViolation('complexity', 'cyclomatic complexity 25 in processData');
    expect(normalizeViolationPattern(v)).toBe('complexity-exceeded');
  });

  it('normalizes coupling violations to category type', () => {
    const v = makeViolation('coupling', 'fan-out 12 for src/services/auth.ts');
    expect(normalizeViolationPattern(v)).toBe('coupling-exceeded');
  });

  it('extracts layer pair from forbidden-imports detail', () => {
    const v = makeViolation(
      'forbidden-imports',
      'types -> core: packages/types/src/index.ts imports packages/core/src/utils.ts'
    );
    expect(normalizeViolationPattern(v)).toBe('types -> core');
  });

  it('normalizes module-size violations to category type', () => {
    const v = makeViolation('module-size', 'module src/services has 45 files (max 30)');
    expect(normalizeViolationPattern(v)).toBe('module-size-exceeded');
  });

  it('normalizes dependency-depth violations to category type', () => {
    const v = makeViolation('dependency-depth', 'depth 9 for module src/core (max 7)');
    expect(normalizeViolationPattern(v)).toBe('depth-exceeded');
  });

  it('returns detail as-is for unknown categories', () => {
    const v = makeViolation(undefined as unknown as string, 'some unknown detail');
    expect(normalizeViolationPattern(v)).toBe('some unknown detail');
  });
});

describe('extractDirectoryScope', () => {
  it('returns parent directory for a file path', () => {
    expect(extractDirectoryScope('src/services/auth.ts')).toBe('src/services/');
  });

  it('returns parent directory for nested path', () => {
    expect(extractDirectoryScope('packages/core/src/architecture/types.ts')).toBe(
      'packages/core/src/architecture/'
    );
  });

  it('returns root for top-level file', () => {
    expect(extractDirectoryScope('index.ts')).toBe('./');
  });

  it('handles paths with trailing slash', () => {
    expect(extractDirectoryScope('src/')).toBe('src/');
  });
});
