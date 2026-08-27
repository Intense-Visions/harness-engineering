import { describe, it, expect } from 'vitest';
import { ComprehensionStore, COMPREHENSION_ROOT, UNIT_FILE } from '../../src/comprehension/store';
import type { ComprehensionIO } from '../../src/comprehension/store';
import { serializeUnit } from '../../src/comprehension/serialize';
import type { ComprehensionUnit } from '../../src/comprehension/types';
import { SCHEMA_VERSION, COMPILER_VERSION } from '../../src/comprehension/types';

function unit(module: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module,
      sourceHash: 'b'.repeat(64),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent',
      members: ['x.ts'],
    },
    summary: '',
    invariants: [],
    interfaceContract: 'export const x: number',
    dependencySlice: 'imports: none',
  };
}

function makeIO() {
  const files = new Map<string, string>();
  const io: ComprehensionIO = {
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => {
      files.set(p, d);
    },
    listUnitPaths: async (root) =>
      [...files.keys()].filter((p) => p.startsWith(`${root}/`) && p.endsWith(`/${UNIT_FILE}`)),
  };
  return { io, files };
}

describe('ComprehensionStore', () => {
  it('path() is posix, rooted, and _module.md-terminated', () => {
    const store = new ComprehensionStore({ io: makeIO().io });
    expect(store.path('packages/core/src/roadmap')).toBe(
      `${COMPREHENSION_ROOT}/packages/core/src/roadmap/${UNIT_FILE}`
    );
  });

  it('path() normalizes backslashes to posix', () => {
    const store = new ComprehensionStore({ io: makeIO().io });
    expect(store.path('packages\\core\\src')).toBe(
      `${COMPREHENSION_ROOT}/packages/core/src/${UNIT_FILE}`
    );
  });

  it('write() then read() round-trips byte-stably', async () => {
    const { io } = makeIO();
    const store = new ComprehensionStore({ io });
    const u = unit('a/b');
    expect((await store.write(u)).ok).toBe(true);
    const r = await store.read('a/b');
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeUnit(r.value)).toBe(serializeUnit(u));
  });

  it('read() of a missing module returns Err', async () => {
    const store = new ComprehensionStore({ io: makeIO().io });
    expect((await store.read('nope')).ok).toBe(false);
  });

  it('list() returns every unit at any tree depth, sorted', async () => {
    const { io } = makeIO();
    const store = new ComprehensionStore({ io });
    await store.write(unit('z/deep/nested'));
    await store.write(unit('a'));
    const r = await store.list();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.units.map((u) => u.provenance.module)).toEqual(['a', 'z/deep/nested']);
      expect(r.value.skipped).toEqual([]);
    }
  });

  // FIX 2 — a single malformed/newer-schema unit must NOT blank the whole tree.
  describe('list() skip-and-report (no total blackout)', () => {
    it('returns the good units and reports the malformed one', async () => {
      const { io } = makeIO();
      const store = new ComprehensionStore({ io });
      await store.write(unit('good/one'));
      await store.write(unit('good/two'));
      // hand-edit a third unit into the tree with unparseable frontmatter.
      await io.writeFile(
        `${COMPREHENSION_ROOT}/bad/mod/${UNIT_FILE}`,
        '---\nmodule: "bad/mod"\n# missing sourceHash / semantic\n---\nbody\n'
      );
      const r = await store.list();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.units.map((u) => u.provenance.module)).toEqual(['good/one', 'good/two']);
        expect(r.value.skipped).toHaveLength(1);
        expect(r.value.skipped[0].path).toBe(`${COMPREHENSION_ROOT}/bad/mod/${UNIT_FILE}`);
        expect(r.value.skipped[0].reason).toMatch(/sourceHash|semantic|schemaVersion/);
      }
    });

    it('reports a unit whose schemaVersion is newer than we understand', async () => {
      const { io } = makeIO();
      const store = new ComprehensionStore({ io });
      await store.write(unit('good'));
      await io.writeFile(
        `${COMPREHENSION_ROOT}/future/mod/${UNIT_FILE}`,
        '---\nmodule: "future/mod"\nschemaVersion: 999\nsourceHash: "abc"\nsemantic: absent\n---\n'
      );
      const r = await store.list();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.units.map((u) => u.provenance.module)).toEqual(['good']);
        expect(r.value.skipped).toHaveLength(1);
        expect(r.value.skipped[0].reason).toMatch(/unsupported schemaVersion/);
      }
    });
  });

  // F3 — module path must not escape the comprehension root.
  describe('F3 path-traversal + newline guards', () => {
    const badModules = [
      '../../etc',
      'a/../../b',
      '..',
      '/abs/path',
      '//unc/share',
      'C:/windows',
      'C:\\windows',
      'a\\b',
      'has\nnewline',
    ];
    for (const m of badModules) {
      it(`write() rejects unsafe module ${JSON.stringify(m)} without touching IO`, async () => {
        const { io, files } = makeIO();
        const store = new ComprehensionStore({ io });
        const r = await store.write(unit(m));
        expect(r.ok).toBe(false);
        expect(files.size).toBe(0);
      });
      it(`read() rejects unsafe module ${JSON.stringify(m)}`, async () => {
        const store = new ComprehensionStore({ io: makeIO().io });
        expect((await store.read(m)).ok).toBe(false);
      });
    }

    it('write() rejects a newline inside a member basename', async () => {
      const { io, files } = makeIO();
      const store = new ComprehensionStore({ io });
      const u = unit('safe/module');
      u.provenance.members = ['ok.ts', 'evil\n- injected'];
      const r = await store.write(u);
      expect(r.ok).toBe(false);
      expect(files.size).toBe(0);
    });

    it('write() still accepts a normal nested module', async () => {
      const { io } = makeIO();
      const store = new ComprehensionStore({ io });
      expect((await store.write(unit('packages/core/src/comprehension'))).ok).toBe(true);
    });
  });
});
