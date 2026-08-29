import { describe, it, expect } from 'vitest';
import {
  detectSemanticRegressions,
  parseModuleSemantic,
  readSemanticMapAtRef,
  type SemanticState,
  type RefReadDeps,
} from '../../src/comprehension/regression';

const m = (entries: [string, SemanticState][]) => new Map(entries);

describe('detectSemanticRegressions', () => {
  it('flags a module that went present → absent', () => {
    const base = m([['pkg/a', 'present']]);
    const head = m([['pkg/a', 'absent']]);
    expect(detectSemanticRegressions(base, head)).toEqual(['pkg/a']);
  });

  it('ignores present → present and absent → anything', () => {
    const base = m([
      ['pkg/a', 'present'],
      ['pkg/b', 'absent'],
    ]);
    const head = m([
      ['pkg/a', 'present'],
      ['pkg/b', 'present'],
    ]);
    expect(detectSemanticRegressions(base, head)).toEqual([]);
  });

  it('does not flag a deleted module (present in base, absent from head map)', () => {
    const base = m([['pkg/gone', 'present']]);
    const head = m<[string, SemanticState][]>([]);
    expect(detectSemanticRegressions(base, head)).toEqual([]);
  });

  it('does not flag a brand-new module (absent from base)', () => {
    const base = m<[string, SemanticState][]>([]);
    const head = m([['pkg/new', 'absent']]);
    expect(detectSemanticRegressions(base, head)).toEqual([]);
  });

  it('returns sorted results for multiple regressions', () => {
    const base = m([
      ['pkg/z', 'present'],
      ['pkg/a', 'present'],
    ]);
    const head = m([
      ['pkg/z', 'absent'],
      ['pkg/a', 'absent'],
    ]);
    expect(detectSemanticRegressions(base, head)).toEqual(['pkg/a', 'pkg/z']);
  });
});

describe('parseModuleSemantic', () => {
  const shard = (module: string, semantic: string) =>
    `---\nschemaVersion: 1\nmodule: '${module}'\nsourceHash: 'abc'\ncompiler: { static: '1.0.0', semantic: '1.0.0' }\nmodel: null\nsemantic: ${semantic}\nmembers: ['a.ts']\n---\n\n## Interface Contract\n`;

  it('extracts module (unquoted) and semantic', () => {
    expect(parseModuleSemantic(shard('packages/core/src/pricing', 'present'))).toEqual({
      module: 'packages/core/src/pricing',
      semantic: 'present',
    });
  });

  it('handles semantic: absent', () => {
    expect(parseModuleSemantic(shard('pkg/a', 'absent'))?.semantic).toBe('absent');
  });

  it('returns null when fields are missing', () => {
    expect(parseModuleSemantic('---\nfoo: bar\n---')).toBeNull();
  });
});

describe('readSemanticMapAtRef', () => {
  it('builds a module→semantic map from committed shards at a ref, skipping missing/unparseable', () => {
    const shards: Record<string, string> = {
      '.harness/comprehension/pkg/a/_module.md': `module: 'pkg/a'\nsemantic: present\n`,
      '.harness/comprehension/pkg/b/_module.md': `module: 'pkg/b'\nsemantic: absent\n`,
      '.harness/comprehension/pkg/junk/_module.md': `not a shard`,
    };
    const deps: RefReadDeps = {
      listShardsAtRef: () => Object.keys(shards),
      showAtRef: (_ref, path) => shards[path] ?? null,
    };
    const map = readSemanticMapAtRef('origin/main', deps);
    expect(map.get('pkg/a')).toBe('present');
    expect(map.get('pkg/b')).toBe('absent');
    expect(map.has('pkg/junk')).toBe(false); // unparseable skipped
    expect(map.size).toBe(2);
  });
});
