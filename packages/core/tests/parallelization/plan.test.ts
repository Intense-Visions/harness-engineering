import { describe, it, expect } from 'vitest';
import { buildTaskGraph } from '../../src/parallelization/plan';

describe('buildTaskGraph()', () => {
  it('carries explicit dependsOn edges through', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: [] },
      { id: 'b', files: [], dependsOn: ['a'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn).toContain('a');
  });

  it('adds an implicit edge for a shared file (later depends on earlier)', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: ['shared.ts'] },
      { id: 'b', files: ['shared.ts'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn).toContain('a');
  });

  it('adds an implicit edge for overlapping owns globs', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: [], owns: ['src/x.ts'] },
      { id: 'b', files: ['src/x.ts'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn).toContain('a');
  });

  it('does not duplicate an edge already present via dependsOn', () => {
    const nodes = buildTaskGraph([
      { id: 'a', files: ['shared.ts'] },
      { id: 'b', files: ['shared.ts'], dependsOn: ['a'] },
    ]);
    const b = nodes.find((n) => n.id === 'b')!;
    expect(b.dependsOn.filter((d) => d === 'a')).toHaveLength(1);
  });
});
