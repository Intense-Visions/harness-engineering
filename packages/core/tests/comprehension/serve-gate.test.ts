import { describe, it, expect } from 'vitest';
import { serveGate } from '../../src/comprehension/serve-gate';
import type { ModuleSourceReader } from '../../src/comprehension/serve-gate';
import { computeSourceHash } from '../../src/comprehension/source-hash';
import type { ComprehensionUnit, SourceFile } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

const FILES: SourceFile[] = [
  { path: 'a.ts', content: 'export const a = 1;' },
  { path: 'b.ts', content: 'export const b = 2;' },
];

function unit(sourceHash: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module: 'pkg/mod',
      sourceHash,
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent',
      members: ['a.ts', 'b.ts'],
    },
    summary: '',
    invariants: [],
    interfaceContract: 'export const a: 1',
    dependencySlice: 'imports: none',
  };
}

function reader(files: SourceFile[] | null): ModuleSourceReader {
  return { readModuleSource: async () => files };
}

describe('serveGate (serve-time hash gate, D7/SC2)', () => {
  it('serves a unit whose stored hash matches current enumeration', async () => {
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(FILES));
    expect(v.serve).toBe(true);
    if (v.serve) expect(v.unit.provenance.module).toBe('pkg/mod');
  });

  it('refuses when a member file content changed (source-stale + recompile)', async () => {
    const changed = [FILES[0], { path: 'b.ts', content: 'export const b = 3;' }];
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(changed));
    expect(v).toEqual({ serve: false, reason: 'source-stale', module: 'pkg/mod', recompile: true });
  });

  it('refuses on a membership delta (added file)', async () => {
    const added = [...FILES, { path: 'c.ts', content: 'export const c = 3;' }];
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(added));
    expect(v.serve).toBe(false);
  });

  it('refuses when the module directory is absent (null enumeration)', async () => {
    const v = await serveGate(unit(computeSourceHash(FILES)), reader(null));
    expect(v.serve).toBe(false);
    if (!v.serve) expect(v.recompile).toBe(true);
  });
});
