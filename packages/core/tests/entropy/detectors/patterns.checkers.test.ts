import { describe, it, expect } from 'vitest';
import {
  checkConfigPattern,
  detectPatternViolations,
} from '../../../src/entropy/detectors/patterns';
import type { ConfigPattern, SourceFile, CodebaseSnapshot } from '../../../src/entropy/types';

/**
 * Behavior tests for the per-rule checkers routed through `checkConfigPattern`
 * and the customPatterns / accounting paths of `detectPatternViolations`.
 *
 * Assumptions (fork answers were not in scope for this pure-logic target):
 * current behavior is characterized as-is.
 */

const loc = (line: number) => ({ file: '', line, column: 0 });

function file(partial: Partial<SourceFile>): SourceFile {
  return {
    path: '/project/src/mod.ts',
    exports: [],
    imports: [],
    jsDocComments: [],
    ...partial,
  } as SourceFile;
}

function pattern(rule: ConfigPattern['rule'], extra: Partial<ConfigPattern> = {}): ConfigPattern {
  return {
    name: 'p',
    description: 'd',
    severity: 'error',
    files: ['**/*.ts'],
    rule,
    ...extra,
  } as ConfigPattern;
}

describe('checkConfigPattern — glob gating', () => {
  it('returns no matches when the file path does not match any pattern glob', () => {
    const p = pattern({ type: 'must-export', names: ['foo'] }, { files: ['src/services/**/*.ts'] });
    const f = file({ path: '/project/src/utils/mod.ts', exports: [] });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });

  it('returns no matches for an unknown rule type', () => {
    const p = pattern({ type: 'not-a-real-rule' } as unknown as ConfigPattern['rule']);
    const f = file({ path: '/project/src/mod.ts' });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });
});

describe('checkMustExport', () => {
  it('flags each missing required export with a default message', () => {
    const p = pattern({ type: 'must-export', names: ['foo', 'bar'] });
    const f = file({
      exports: [{ name: 'foo', type: 'named', location: loc(1), isReExport: false }],
    });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches).toHaveLength(1);
    expect(matches[0].message).toContain('bar');
    expect(matches[0].line).toBe(1);
    expect(matches[0].suggestion).toContain('bar');
  });

  it('produces no matches when all required exports are present', () => {
    const p = pattern({ type: 'must-export', names: ['foo'] });
    const f = file({
      exports: [{ name: 'foo', type: 'named', location: loc(3), isReExport: false }],
    });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });

  it('honors a custom message when provided', () => {
    const p = pattern({ type: 'must-export', names: ['foo'] }, { message: 'custom-msg' });
    const f = file({ exports: [] });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches[0].message).toBe('custom-msg');
  });
});

describe('checkNoExport', () => {
  it('flags a forbidden export at its own source line', () => {
    const p = pattern({ type: 'no-export', names: ['secret'] });
    const f = file({
      exports: [{ name: 'secret', type: 'named', location: loc(9), isReExport: false }],
    });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches).toHaveLength(1);
    expect(matches[0].line).toBe(9);
    expect(matches[0].message).toContain('secret');
  });

  it('produces no matches when the forbidden export is absent', () => {
    const p = pattern({ type: 'no-export', names: ['secret'] });
    const f = file({
      exports: [{ name: 'ok', type: 'named', location: loc(1), isReExport: false }],
    });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });
});

describe('checkMustImport', () => {
  it('flags a missing required import', () => {
    const p = pattern({ type: 'must-import', from: 'react' });
    const f = file({ imports: [] });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches).toHaveLength(1);
    expect(matches[0].message).toContain('react');
  });

  it('accepts an import matched by suffix (endsWith)', () => {
    const p = pattern({ type: 'must-import', from: 'shared/result' });
    const f = file({
      imports: [
        { source: '../../shared/result', specifiers: ['Ok'], location: loc(2), kind: 'value' },
      ],
    });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });
});

describe('checkNaming', () => {
  it('flags an export that violates the convention and describes the convention', () => {
    const p = pattern({ type: 'naming', match: '^[A-Z]', convention: 'PascalCase' });
    const f = file({
      exports: [{ name: 'lowerName', type: 'named', location: loc(4), isReExport: false }],
    });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches).toHaveLength(1);
    expect(matches[0].message).toContain('PascalCase');
    expect(matches[0].suggestion).toContain('MyClass');
    expect(matches[0].line).toBe(4);
  });

  it('passes an export that satisfies the convention', () => {
    const p = pattern({ type: 'naming', match: '^[A-Z]', convention: 'PascalCase' });
    const f = file({
      exports: [{ name: 'GoodName', type: 'named', location: loc(1), isReExport: false }],
    });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });

  it('falls back to the raw convention name when no description exists', () => {
    const p = pattern({ type: 'naming', match: '^[A-Z]', convention: 'weirdConvention' });
    const f = file({
      exports: [{ name: 'bad', type: 'named', location: loc(1), isReExport: false }],
    });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches[0].suggestion).toContain('weirdConvention');
  });
});

describe('checkRequireJsdoc', () => {
  it('flags a file that has exports but no JSDoc comments', () => {
    const p = pattern({ type: 'require-jsdoc' });
    const f = file({
      exports: [{ name: 'foo', type: 'named', location: loc(1), isReExport: false }],
      jsDocComments: [],
    });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches).toHaveLength(1);
    expect(matches[0].message).toContain('JSDoc');
  });

  it('passes a file that has JSDoc comments', () => {
    const p = pattern({ type: 'require-jsdoc' });
    const f = file({
      exports: [{ name: 'foo', type: 'named', location: loc(1), isReExport: false }],
      jsDocComments: [
        { text: '/** doc */', location: loc(1) },
      ] as unknown as SourceFile['jsDocComments'],
    });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });

  it('passes a file with no exports even when undocumented', () => {
    const p = pattern({ type: 'require-jsdoc' });
    const f = file({ exports: [], jsDocComments: [] });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });
});

describe('checkMaxLines', () => {
  it('is a no-op that never flags (line count unavailable)', () => {
    const p = pattern({ type: 'max-lines', count: 1 } as unknown as ConfigPattern['rule']);
    const f = file({
      exports: [{ name: 'a', type: 'named', location: loc(1), isReExport: false }],
    });
    expect(checkConfigPattern(p, f, '/project')).toEqual([]);
  });
});

describe('detectPatternViolations — customPatterns and accounting', () => {
  function snapshot(files: SourceFile[]): CodebaseSnapshot {
    return { rootDir: '/project', files } as CodebaseSnapshot;
  }

  it('runs customPatterns and records their matches with severity', async () => {
    const f = file({ path: '/project/src/a.ts' });
    const result = await detectPatternViolations(snapshot([f]), {
      patterns: [],
      customPatterns: [
        {
          name: 'custom-rule',
          description: 'always fires',
          severity: 'warning',
          check: () => [{ line: 7, message: 'custom hit', suggestion: 'fix it' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations).toHaveLength(1);
    expect(result.value.violations[0].pattern).toBe('custom-rule');
    expect(result.value.violations[0].severity).toBe('warning');
    expect(result.value.stats.warningCount).toBe(1);
    expect(result.value.stats.errorCount).toBe(0);
  });

  it('supplies a default suggestion when a custom match omits one', async () => {
    const f = file({ path: '/project/src/a.ts' });
    const result = await detectPatternViolations(snapshot([f]), {
      patterns: [],
      customPatterns: [
        {
          name: 'no-suggestion',
          description: 'd',
          severity: 'error',
          check: () => [{ line: 1, message: 'hit' }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.violations[0].suggestion).toContain('Review');
    expect(result.value.stats.errorCount).toBe(1);
  });

  it('reports a passRate of 1 when there are no patterns to check', async () => {
    const f = file({ path: '/project/src/a.ts' });
    const result = await detectPatternViolations(snapshot([f]), { patterns: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passRate).toBe(1);
    expect(result.value.stats.violationCount).toBe(0);
    expect(result.value.stats.filesChecked).toBe(1);
  });

  it('computes a fractional passRate from checks minus violations', async () => {
    // 1 file x 1 pattern = 1 check; 1 violation => passRate 0
    const f = file({ path: '/project/src/a.ts', exports: [] });
    const result = await detectPatternViolations(snapshot([f]), {
      patterns: [pattern({ type: 'must-export', names: ['missing'] })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stats.violationCount).toBe(1);
    expect(result.value.passRate).toBe(0);
  });
});
