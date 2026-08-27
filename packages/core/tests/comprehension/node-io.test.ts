import { describe, it, expect, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNodeComprehensionIO } from '../../src/comprehension/node-io';
import { ComprehensionStore } from '../../src/comprehension/store';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

let root = '';
afterEach(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true });
});

function unit(module: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module,
      sourceHash: 'c'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent',
      members: ['m.ts'],
    },
    summary: '',
    invariants: [],
    interfaceContract: 'export const m: 1',
    dependencySlice: 'imports: none',
  };
}

describe('createNodeComprehensionIO', () => {
  it('writeFile creates parent dirs; read round-trips through a real dir', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-'));
    const store = new ComprehensionStore({ root, io: createNodeComprehensionIO() });
    expect((await store.write(unit('deep/nested/mod'))).ok).toBe(true);
    const r = await store.read('deep/nested/mod');
    expect(r.ok).toBe(true);
  });

  it('listUnitPaths finds nested units and returns posix paths', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-'));
    const store = new ComprehensionStore({ root, io: createNodeComprehensionIO() });
    await store.write(unit('a'));
    await store.write(unit('x/y/z'));
    const r = await store.list();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((u) => u.provenance.module).sort()).toEqual(['a', 'x/y/z']);
  });

  it('listUnitPaths returns empty for an absent root (no throw)', async () => {
    const io = createNodeComprehensionIO();
    expect(await io.listUnitPaths(path.join(os.tmpdir(), 'does-not-exist-xyz'))).toEqual([]);
  });
});
