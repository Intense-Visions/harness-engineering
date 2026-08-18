import { describe, it, expect } from 'vitest';
import {
  generateImpactData,
  categorizeImpact,
  type ImpactSourceNode,
} from '../../packages/core/src/blueprint/impact-lab-generator';

describe('Impact Lab Data Generation', () => {
  it('generates valid, empty impact data when no analyzer (no graph) is wired', async () => {
    const data = await generateImpactData('src/index.ts');

    expect(data).toBeDefined();
    expect(data.file).toBe('src/index.ts');
    expect(Array.isArray(data.impacts)).toBe(true);
    expect(data.impacts).toHaveLength(0);
    expect(data.counts).toEqual({ tests: 0, docs: 0, code: 0, other: 0 });
    // generatedAt is a valid ISO-8601 timestamp.
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false);
  });

  it('classifies impacted nodes and tallies per-category counts', async () => {
    const nodes: ImpactSourceNode[] = [
      { id: 'file:src/service.ts', type: 'file', path: 'src/service.ts' },
      { id: 'fn:handle', type: 'function', path: 'src/service.ts' },
      { id: 'test:service.test.ts', type: 'test_result', path: 'src/service.test.ts' },
      { id: 'adr:0007', type: 'adr' },
      { id: 'misc:config', type: 'config' },
    ];
    const data = await generateImpactData('src/index.ts', {
      analyzer: () => nodes,
    });

    expect(data.impacts).toHaveLength(5);
    expect(data.counts).toEqual({ tests: 1, docs: 1, code: 2, other: 1 });
    // Every impact carries a resolved category.
    for (const impact of data.impacts) {
      expect(['tests', 'docs', 'code', 'other']).toContain(impact.category);
    }
    const test = data.impacts.find((i) => i.id === 'test:service.test.ts');
    expect(test?.category).toBe('tests');
  });

  it('excludes the target file itself from its own impact set', async () => {
    const data = await generateImpactData('src/index.ts', {
      analyzer: (file) => [
        { id: `file:${file}`, type: 'file', path: file },
        { id: 'file:src/other.ts', type: 'file', path: 'src/other.ts' },
      ],
    });

    expect(data.impacts).toHaveLength(1);
    expect(data.impacts[0]!.path).toBe('src/other.ts');
    expect(data.counts.code).toBe(1);
  });

  it('supports async analyzers (e.g. a graph-backed impact query)', async () => {
    const data = await generateImpactData('src/index.ts', {
      analyzer: async () => [{ id: 'doc:readme', type: 'document', path: 'README.md' }],
    });

    expect(data.counts.docs).toBe(1);
    expect(data.impacts[0]!.category).toBe('docs');
  });

  it('categorizeImpact maps known node types and defaults unknowns to "other"', () => {
    expect(categorizeImpact('function')).toBe('code');
    expect(categorizeImpact('test_result')).toBe('tests');
    expect(categorizeImpact('adr')).toBe('docs');
    expect(categorizeImpact('something-unknown')).toBe('other');
  });
});
