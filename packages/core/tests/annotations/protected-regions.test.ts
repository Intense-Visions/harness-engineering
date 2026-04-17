import { describe, it, expect } from 'vitest';
import {
  parseFileRegions,
  parseProtectedRegions,
  createRegionMap,
} from '../../src/annotations/protected-regions';

describe('parseFileRegions', () => {
  it('parses a block region with start and end markers', () => {
    const content = [
      'const a = 1;',
      '// harness-ignore-start entropy: SOX audit requirement',
      'export function audit() {',
      '  return calculate();',
      '}',
      '// harness-ignore-end',
      'const b = 2;',
    ].join('\n');

    const { regions, issues } = parseFileRegions('src/audit.ts', content);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      file: 'src/audit.ts',
      startLine: 2,
      endLine: 6,
      scopes: ['entropy'],
      reason: 'SOX audit requirement',
      type: 'block',
    });
    expect(issues).toHaveLength(0);
  });

  it('parses a line-level annotation protecting the next code line', () => {
    const content = [
      '// harness-ignore entropy: compliance',
      'export function required() {}',
      'const other = 1;',
    ].join('\n');

    const { regions, issues } = parseFileRegions('src/comp.ts', content);

    expect(regions).toHaveLength(1);
    expect(regions[0]).toEqual({
      file: 'src/comp.ts',
      startLine: 2,
      endLine: 2,
      scopes: ['entropy'],
      reason: 'compliance',
      type: 'line',
    });
    expect(issues).toHaveLength(0);
  });

  it('skips comment and blank lines when finding the protected line', () => {
    const content = [
      '// harness-ignore entropy: reason',
      '// this is a comment',
      '',
      'export const value = 42;',
    ].join('\n');

    const { regions } = parseFileRegions('src/val.ts', content);

    expect(regions).toHaveLength(1);
    expect(regions[0]!.startLine).toBe(4);
    expect(regions[0]!.endLine).toBe(4);
  });

  it('parses multiple scope categories', () => {
    const content = [
      '// harness-ignore-start entropy,architecture: vendor lock-in',
      'import { SDK } from "@vendor/sdk";',
      '// harness-ignore-end',
    ].join('\n');

    const { regions } = parseFileRegions('src/vendor.ts', content);

    expect(regions).toHaveLength(1);
    expect(regions[0]!.scopes).toEqual(['entropy', 'architecture']);
  });

  it('defaults to "all" scope when no scope specified', () => {
    const content = [
      '// harness-ignore-start: critical section',
      'const x = 1;',
      '// harness-ignore-end',
    ].join('\n');

    const { regions } = parseFileRegions('src/crit.ts', content);

    expect(regions).toHaveLength(1);
    expect(regions[0]!.scopes).toEqual(['all']);
  });

  it('extracts reason text after colon', () => {
    const content = [
      '// harness-ignore-start entropy: FIPS-certified implementation',
      'function hmac() {}',
      '// harness-ignore-end',
    ].join('\n');

    const { regions } = parseFileRegions('src/crypto.ts', content);
    expect(regions[0]!.reason).toBe('FIPS-certified implementation');
  });

  it('handles null reason when no colon provided', () => {
    const content = [
      '// harness-ignore-start entropy',
      'function hmac() {}',
      '// harness-ignore-end',
    ].join('\n');

    const { regions } = parseFileRegions('src/crypto.ts', content);
    expect(regions[0]!.reason).toBeNull();
  });

  it('reports unclosed blocks as validation issues', () => {
    const content = ['// harness-ignore-start entropy: never closed', 'function orphan() {}'].join(
      '\n'
    );

    const { regions, issues } = parseFileRegions('src/bad.ts', content);

    // Region still created (covers to end of file)
    expect(regions).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      file: 'src/bad.ts',
      line: 1,
      type: 'unclosed-block',
      message: 'harness-ignore-start at line 1 has no matching harness-ignore-end',
    });
  });

  it('reports orphaned end markers as validation issues', () => {
    const content = ['const a = 1;', '// harness-ignore-end'].join('\n');

    const { regions, issues } = parseFileRegions('src/bad2.ts', content);

    expect(regions).toHaveLength(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      file: 'src/bad2.ts',
      line: 2,
      type: 'orphaned-end',
      message: 'harness-ignore-end at line 2 has no matching harness-ignore-start',
    });
  });

  it('reports unknown scopes as validation issues', () => {
    const content = [
      '// harness-ignore-start bogus: bad scope',
      'const a = 1;',
      '// harness-ignore-end',
    ].join('\n');

    const { regions, issues } = parseFileRegions('src/bad3.ts', content);

    // Region still created with valid scopes filtered
    expect(issues).toHaveLength(1);
    expect(issues[0]!.type).toBe('unknown-scope');
    expect(issues[0]!.message).toContain('bogus');
  });

  it('handles # comment prefix for Python/shell files', () => {
    const content = [
      '# harness-ignore-start entropy: legacy script',
      'def legacy():',
      '    pass',
      '# harness-ignore-end',
    ].join('\n');

    const { regions } = parseFileRegions('scripts/legacy.py', content);

    expect(regions).toHaveLength(1);
    expect(regions[0]!.scopes).toEqual(['entropy']);
    expect(regions[0]!.reason).toBe('legacy script');
  });

  it('handles empty files', () => {
    const { regions, issues } = parseFileRegions('src/empty.ts', '');
    expect(regions).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it('handles files with no annotations', () => {
    const content = [
      'const a = 1;',
      'const b = 2;',
      'export function foo() { return a + b; }',
    ].join('\n');

    const { regions, issues } = parseFileRegions('src/clean.ts', content);
    expect(regions).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it('handles multiple block regions in one file', () => {
    const content = [
      '// harness-ignore-start entropy: region 1',
      'const a = 1;',
      '// harness-ignore-end',
      'const b = 2;',
      '// harness-ignore-start architecture: region 2',
      'import { x } from "forbidden";',
      '// harness-ignore-end',
    ].join('\n');

    const { regions } = parseFileRegions('src/multi.ts', content);

    expect(regions).toHaveLength(2);
    expect(regions[0]!.reason).toBe('region 1');
    expect(regions[1]!.reason).toBe('region 2');
  });

  it('does not match harness-ignore SEC- patterns (security scanner syntax)', () => {
    const content = [
      '// harness-ignore SEC-CRY-001: false positive',
      'const key = process.env.API_KEY;',
    ].join('\n');

    const { regions } = parseFileRegions('src/config.ts', content);

    // SEC-XXX-NNN is handled by security scanner, not by protected regions
    expect(regions).toHaveLength(0);
  });
});

describe('createRegionMap', () => {
  it('isProtected returns true for lines inside a block region', () => {
    const map = createRegionMap([
      {
        file: 'src/audit.ts',
        startLine: 3,
        endLine: 8,
        scopes: ['entropy'],
        reason: 'test',
        type: 'block',
      },
    ]);

    expect(map.isProtected('src/audit.ts', 3, 'entropy')).toBe(true);
    expect(map.isProtected('src/audit.ts', 5, 'entropy')).toBe(true);
    expect(map.isProtected('src/audit.ts', 8, 'entropy')).toBe(true);
  });

  it('isProtected returns false for lines outside a block region', () => {
    const map = createRegionMap([
      {
        file: 'src/audit.ts',
        startLine: 3,
        endLine: 8,
        scopes: ['entropy'],
        reason: 'test',
        type: 'block',
      },
    ]);

    expect(map.isProtected('src/audit.ts', 2, 'entropy')).toBe(false);
    expect(map.isProtected('src/audit.ts', 9, 'entropy')).toBe(false);
  });

  it('isProtected respects scope — wrong scope returns false', () => {
    const map = createRegionMap([
      {
        file: 'src/audit.ts',
        startLine: 3,
        endLine: 8,
        scopes: ['entropy'],
        reason: 'test',
        type: 'block',
      },
    ]);

    expect(map.isProtected('src/audit.ts', 5, 'architecture')).toBe(false);
  });

  it('isProtected matches "all" scope against any query scope', () => {
    const map = createRegionMap([
      {
        file: 'src/crit.ts',
        startLine: 1,
        endLine: 5,
        scopes: ['all'],
        reason: 'critical',
        type: 'block',
      },
    ]);

    expect(map.isProtected('src/crit.ts', 3, 'entropy')).toBe(true);
    expect(map.isProtected('src/crit.ts', 3, 'architecture')).toBe(true);
    expect(map.isProtected('src/crit.ts', 3, 'security')).toBe(true);
  });

  it('isProtected returns false for wrong file', () => {
    const map = createRegionMap([
      {
        file: 'src/audit.ts',
        startLine: 1,
        endLine: 10,
        scopes: ['all'],
        reason: null,
        type: 'block',
      },
    ]);

    expect(map.isProtected('src/other.ts', 5, 'entropy')).toBe(false);
  });

  it('getRegions returns only regions for specified file', () => {
    const map = createRegionMap([
      {
        file: 'src/a.ts',
        startLine: 1,
        endLine: 5,
        scopes: ['entropy'],
        reason: null,
        type: 'block',
      },
      {
        file: 'src/b.ts',
        startLine: 1,
        endLine: 3,
        scopes: ['all'],
        reason: null,
        type: 'block',
      },
    ]);

    expect(map.getRegions('src/a.ts')).toHaveLength(1);
    expect(map.getRegions('src/b.ts')).toHaveLength(1);
    expect(map.getRegions('src/c.ts')).toHaveLength(0);
  });

  it('handles empty regions array', () => {
    const map = createRegionMap([]);

    expect(map.regions).toHaveLength(0);
    expect(map.isProtected('any.ts', 1, 'entropy')).toBe(false);
    expect(map.getRegions('any.ts')).toHaveLength(0);
  });
});

describe('parseProtectedRegions', () => {
  it('parses multiple files and aggregates regions', () => {
    const files = [
      {
        path: 'src/a.ts',
        content: [
          '// harness-ignore-start entropy: reason a',
          'const a = 1;',
          '// harness-ignore-end',
        ].join('\n'),
      },
      {
        path: 'src/b.ts',
        content: ['// harness-ignore architecture: reason b', 'import { x } from "y";'].join('\n'),
      },
    ];

    const { regions, issues } = parseProtectedRegions(files);

    expect(regions.regions).toHaveLength(2);
    expect(regions.isProtected('src/a.ts', 2, 'entropy')).toBe(true);
    expect(regions.isProtected('src/b.ts', 2, 'architecture')).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('aggregates issues from multiple files', () => {
    const files = [
      {
        path: 'src/bad1.ts',
        content: '// harness-ignore-start entropy: unclosed',
      },
      {
        path: 'src/bad2.ts',
        content: '// harness-ignore-end',
      },
    ];

    const { issues } = parseProtectedRegions(files);

    expect(issues).toHaveLength(2);
    expect(issues[0]!.type).toBe('unclosed-block');
    expect(issues[1]!.type).toBe('orphaned-end');
  });
});
