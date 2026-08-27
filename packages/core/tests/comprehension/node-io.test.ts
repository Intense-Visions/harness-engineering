import { describe, it, expect, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNodeComprehensionIO } from '../../src/comprehension/node-io';
import { createNodeModuleSourceReader } from '../../src/comprehension/node-io';
import { computeSourceHash } from '../../src/comprehension/source-hash';
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

describe('createNodeModuleSourceReader (canonical enumeration)', () => {
  it('enumerates direct source files keyed by module-relative basename', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-src-'));
    const mod = path.join(root, 'pkg', 'mod');
    await fsp.mkdir(mod, { recursive: true });
    await fsp.writeFile(path.join(mod, 'a.ts'), 'export const a = 1;');
    await fsp.writeFile(path.join(mod, 'b.ts'), 'export const b = 2;');
    await fsp.writeFile(path.join(mod, 'README.md'), 'ignored'); // non-source ext
    const files = await createNodeModuleSourceReader(root).readModuleSource('pkg/mod');
    expect(files?.map((f) => f.path).sort()).toEqual(['a.ts', 'b.ts']);
    // Stable hash: reader output feeds computeSourceHash deterministically.
    expect(typeof computeSourceHash(files!)).toBe('string');
  });

  it('returns null for an absent module directory', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-src-'));
    expect(await createNodeModuleSourceReader(root).readModuleSource('nope/gone')).toBeNull();
  });

  it('does not recurse into nested sub-directories (module = directory, D3)', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehension-src-'));
    const mod = path.join(root, 'm');
    await fsp.mkdir(path.join(mod, 'sub'), { recursive: true });
    await fsp.writeFile(path.join(mod, 'top.ts'), 'export const t = 1;');
    await fsp.writeFile(path.join(mod, 'sub', 'deep.ts'), 'export const d = 1;');
    const files = await createNodeModuleSourceReader(root).readModuleSource('m');
    expect(files?.map((f) => f.path)).toEqual(['top.ts']);
  });
});
