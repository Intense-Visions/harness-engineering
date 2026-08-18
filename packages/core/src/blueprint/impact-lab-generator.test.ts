import { describe, it, expect } from 'vitest';
import {
  generateImpactData,
  categorizeImpact,
  type ImpactSourceNode,
} from './impact-lab-generator';

describe('categorizeImpact', () => {
  it('maps test node types to "tests"', () => {
    expect(categorizeImpact('test_result')).toBe('tests');
    expect(categorizeImpact('test')).toBe('tests');
  });

  it('maps documentation node types to "docs"', () => {
    for (const type of ['adr', 'decision', 'document', 'learning']) {
      expect(categorizeImpact(type)).toBe('docs');
    }
  });

  it('maps code node types to "code"', () => {
    for (const type of ['file', 'module', 'class', 'interface', 'function', 'method', 'variable']) {
      expect(categorizeImpact(type)).toBe('code');
    }
  });

  it('defaults unknown node types to "other"', () => {
    expect(categorizeImpact('config')).toBe('other');
    expect(categorizeImpact('')).toBe('other');
  });
});

describe('generateImpactData', () => {
  it('returns valid, empty data with the default (no-graph) analyzer', async () => {
    const data = await generateImpactData('src/index.ts');

    expect(data.file).toBe('src/index.ts');
    expect(data.impacts).toEqual([]);
    expect(data.counts).toEqual({ tests: 0, docs: 0, code: 0, other: 0 });
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false);
  });

  it('classifies impacted nodes and tallies per-category counts', async () => {
    const nodes: ImpactSourceNode[] = [
      { id: 'file:src/service.ts', type: 'file', path: 'src/service.ts' },
      { id: 'fn:handle', type: 'function', path: 'src/service.ts' },
      { id: 'test:svc', type: 'test_result', path: 'src/service.test.ts' },
      { id: 'adr:0007', type: 'adr' },
      { id: 'misc:cfg', type: 'config' },
    ];

    const data = await generateImpactData('src/index.ts', { analyzer: () => nodes });

    expect(data.impacts).toHaveLength(5);
    expect(data.counts).toEqual({ tests: 1, docs: 1, code: 2, other: 1 });
    expect(data.impacts.every((i) => typeof i.category === 'string')).toBe(true);
  });

  it('excludes the target file from its own impacts (by path and by node id)', async () => {
    const byPath = await generateImpactData('src/index.ts', {
      analyzer: (file) => [
        { id: 'x', type: 'file', path: file },
        { id: 'file:src/other.ts', type: 'file', path: 'src/other.ts' },
      ],
    });
    expect(byPath.impacts).toHaveLength(1);
    expect(byPath.impacts[0]!.path).toBe('src/other.ts');

    const byId = await generateImpactData('src/index.ts', {
      analyzer: (file) => [{ id: `file:${file}`, type: 'file' }],
    });
    expect(byId.impacts).toHaveLength(0);
  });

  it('awaits async analyzers (e.g. a graph-backed impact query)', async () => {
    const data = await generateImpactData('src/index.ts', {
      analyzer: async () => [{ id: 'doc:readme', type: 'document', path: 'README.md' }],
    });

    expect(data.counts.docs).toBe(1);
    expect(data.impacts[0]!.category).toBe('docs');
  });
});
