import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('reports an unknown rule type instead of silently passing it (#2324)', () => {
    const p = pattern({ type: 'not-a-real-rule' } as unknown as ConfigPattern['rule']);
    const f = file({ path: '/project/src/mod.ts' });
    const matches = checkConfigPattern(p, f, '/project');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.message).toBe(
      'Unknown pattern rule type "not-a-real-rule" in "p": this rule was not checked'
    );
  });

  it('does not treat Object.prototype keys as rule types', () => {
    const p = pattern({ type: 'toString' } as unknown as ConfigPattern['rule']);
    const matches = checkConfigPattern(p, file({}), '/project');
    expect(matches[0]!.message).toMatch(/Unknown pattern rule type "toString"/);
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
  // Real files on disk: SourceFile carries no source text, so the checker
  // counts the lines of the file at `file.path` (issue #2324).
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'max-lines-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  function onDisk(name: string, text: string): SourceFile {
    const path = join(dir, name);
    writeFileSync(path, text);
    return file({ path });
  }
  const maxLines = (count: number, extra: Partial<ConfigPattern> = {}) =>
    pattern({ type: 'max-lines', count }, { files: ['**/*.ts'], ...extra });
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `const a${i} = ${i};`);

  it('flags a file with N+1 lines against count N, at the first line over the limit', () => {
    const f = onDisk('over.ts', lines(4).join('\n') + '\n');
    const matches = checkConfigPattern(maxLines(3), f, dir);
    expect(matches).toEqual([
      {
        line: 4,
        message: 'File has 4 lines, max is 3',
        suggestion: 'Split into smaller files or reduce to 3 lines',
      },
    ]);
  });

  it('does not flag a file with exactly N lines', () => {
    const f = onDisk('exact.ts', lines(3).join('\n') + '\n');
    expect(checkConfigPattern(maxLines(3), f, dir)).toEqual([]);
  });

  it('does not count the empty line after a trailing newline (eslint max-lines semantics)', () => {
    const withNl = onDisk('nl.ts', lines(3).join('\n') + '\n');
    const withoutNl = onDisk('no-nl.ts', lines(3).join('\n'));
    expect(checkConfigPattern(maxLines(3), withNl, dir)).toEqual([]);
    expect(checkConfigPattern(maxLines(3), withoutNl, dir)).toEqual([]);
    expect(checkConfigPattern(maxLines(2), withoutNl, dir)).toHaveLength(1);
  });

  it('counts blank lines and CRLF line endings as lines', () => {
    const f = onDisk('crlf.ts', 'const a = 1;\r\n\r\nconst b = 2;\r\n');
    expect(checkConfigPattern(maxLines(3), f, dir)).toEqual([]);
    expect(checkConfigPattern(maxLines(2), f, dir)).toHaveLength(1);
  });

  it('uses the configured message when one is given', () => {
    const f = onDisk('msg.ts', lines(2).join('\n'));
    const [m] = checkConfigPattern(maxLines(1, { message: 'too long' }), f, dir);
    expect(m?.message).toBe('too long');
  });

  it('reports a violation it could not check rather than passing silently', () => {
    const f = file({ path: join(dir, 'missing.ts') });
    const matches = checkConfigPattern(maxLines(1), f, dir);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.message).toMatch(/could not read/i);
  });
});

describe('every rule type flags a known-bad file (#2324)', () => {
  // `satisfies Record<type, …>` makes this table exhaustive: a rule type added
  // to the union without a case here fails typecheck, so no type can ship as a
  // checker that never fires.
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rule-types-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const exp = (name: string, type: 'named' | 'default' = 'named') => ({
    name,
    type,
    location: loc(1),
    isReExport: false,
  });
  const cases = {
    'must-export': () => ({ rule: { type: 'must-export', names: ['x'] }, f: file({}) }),
    'must-export-default': () => ({ rule: { type: 'must-export-default' }, f: file({}) }),
    'no-export': () => ({
      rule: { type: 'no-export', names: ['x'] },
      f: file({ exports: [exp('x')] }),
    }),
    'must-import': () => ({ rule: { type: 'must-import', from: 'lib' }, f: file({}) }),
    'no-import': () => ({
      rule: { type: 'no-import', from: 'lib' },
      f: file({
        imports: [{ source: 'lib', specifiers: [], location: loc(2), kind: 'value' }],
      } as unknown as Partial<SourceFile>),
    }),
    naming: () => ({
      rule: { type: 'naming', match: '^[a-z]', convention: 'camelCase' },
      f: file({ exports: [exp('Bad')] }),
    }),
    'max-exports': () => ({
      rule: { type: 'max-exports', count: 1 },
      f: file({ exports: [exp('a'), exp('b')] }),
    }),
    'max-lines': () => {
      const path = join(dir, 'long.ts');
      writeFileSync(path, 'a;\nb;\n');
      return { rule: { type: 'max-lines', count: 1 }, f: file({ path }) };
    },
    'require-jsdoc': () => ({
      rule: { type: 'require-jsdoc', for: ['export'] },
      f: file({ exports: [exp('a')] }),
    }),
  } satisfies Record<
    ConfigPattern['rule']['type'],
    () => { rule: ConfigPattern['rule']; f: SourceFile }
  >;

  it.each(Object.keys(cases) as (keyof typeof cases)[])('%s', (type) => {
    const { rule, f } = cases[type]();
    const root = type === 'max-lines' ? dir : '/project';
    expect(checkConfigPattern(pattern(rule), f, root).length).toBeGreaterThan(0);
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
