import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import {
  ComprehensionStore,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
  computeSourceHash,
  COMPILER_VERSION,
  SCHEMA_VERSION,
} from '@harness-engineering/core';
import type { ComprehensionUnit } from '@harness-engineering/core';
import { handleGatherContext } from '../../../src/mcp/tools/gather-context';

let root = '';
beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'gc-comp-'));
});
afterEach(async () => {
  if (root) await fsp.rm(root, { recursive: true, force: true });
});

async function writeModule(module: string, files: Record<string, string>) {
  const dir = path.join(root, module);
  await fsp.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fsp.writeFile(path.join(dir, name), content);
  }
}

function unit(module: string, sourceHash: string): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: SCHEMA_VERSION,
      module,
      sourceHash,
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: COMPILER_VERSION.static, semantic: COMPILER_VERSION.semantic },
      model: null,
      semantic: 'absent', // static-only unit is valid this phase (SC4)
      members: Object.keys({ 'a.ts': 1 }),
    },
    summary: '',
    invariants: [],
    interfaceContract: `export const from_${module.replace(/\W/g, '_')}: 1`,
    dependencySlice: 'imports: none',
  };
}

async function seed(module: string, files: Record<string, string>, hash: string) {
  await writeModule(module, files);
  const store = new ComprehensionStore({
    root: `${root.replaceAll('\\', '/')}/.harness/comprehension`,
    io: createNodeComprehensionIO(),
  });
  const r = await store.write(unit(module, hash));
  expect(r.ok).toBe(true);
}

describe('gather_context comprehension constituent (SC2, SC4)', () => {
  it('serves a fresh unit and drops a source-stale one with a recompile signal (SC2)', async () => {
    const freshFiles = { 'a.ts': 'export const a = 1;' };
    // seed fresh AFTER computing hash from the written files:
    await writeModule('pkg/fresh', freshFiles);
    await seed(
      'pkg/fresh',
      freshFiles,
      computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('pkg/fresh'))!)
    );
    await seed('pkg/stale', { 'a.ts': 'export const a = 1;' }, 'd'.repeat(64)); // wrong hash

    const res = await handleGatherContext({
      path: root,
      intent: 'understand modules',
      include: ['comprehension'],
      mode: 'detailed',
    });
    const parsed = JSON.parse(res.content[0].text);
    const served: Array<{ module: string }> = parsed.comprehension.served;
    expect(served.map((s) => s.module)).toContain('pkg/fresh');
    expect(served.map((s) => s.module)).not.toContain('pkg/stale');
    expect(parsed.comprehension.stale.map((s: { module: string }) => s.module)).toContain(
      'pkg/stale'
    );
  });

  it('runs the whole serve path with zero LLM / no credential (SC4)', async () => {
    const saved = {
      key: process.env.ANTHROPIC_API_KEY,
      base: process.env.HARNESS_ANALYSIS_BASE_URL,
    };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.HARNESS_ANALYSIS_BASE_URL;
    try {
      const files = { 'a.ts': 'export const a = 1;' };
      await writeModule('m', files);
      await seed(
        'm',
        files,
        computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('m'))!)
      );
      const res = await handleGatherContext({
        path: root,
        intent: 'x',
        include: ['comprehension'],
        mode: 'detailed',
      });
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.comprehension.served.map((s: { module: string }) => s.module)).toContain('m');
      expect(parsed.meta.errors).toEqual([]);
    } finally {
      if (saved.key) process.env.ANTHROPIC_API_KEY = saved.key;
      if (saved.base) process.env.HARNESS_ANALYSIS_BASE_URL = saved.base;
    }
  });

  it('summary mode returns counts, not full markdown', async () => {
    const files = { 'a.ts': 'export const a = 1;' };
    await writeModule('m', files);
    await seed(
      'm',
      files,
      computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('m'))!)
    );
    const res = await handleGatherContext({ path: root, intent: 'x', include: ['comprehension'] });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.comprehension).toHaveProperty('unitsServed', 1);
    expect(parsed.comprehension).not.toHaveProperty('served');
  });

  it('is gracefully absent when .harness/comprehension/ does not exist', async () => {
    const res = await handleGatherContext({ path: root, intent: 'x', include: ['comprehension'] });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.comprehension.unitsAvailable).toBe(0);
    expect(parsed.meta.errors).toEqual([]);
  });

  // FIX 2 — a single malformed committed unit must NOT blank the whole substrate.
  it('serves the good units and surfaces a malformed one (no total blackout)', async () => {
    const filesA = { 'a.ts': 'export const a = 1;' };
    const filesB = { 'b.ts': 'export const b = 2;' };
    await writeModule('pkg/a', filesA);
    await writeModule('pkg/b', filesB);
    await seed(
      'pkg/a',
      filesA,
      computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('pkg/a'))!)
    );
    await seed(
      'pkg/b',
      filesB,
      computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('pkg/b'))!)
    );
    // Drop a hand-broken unit straight into the tree (missing sourceHash).
    const badDir = path.join(root, '.harness', 'comprehension', 'pkg', 'bad');
    await fsp.mkdir(badDir, { recursive: true });
    await fsp.writeFile(
      path.join(badDir, '_module.md'),
      '---\nmodule: "pkg/bad"\nschemaVersion: 1\nsemantic: absent\n---\nbroken\n'
    );

    const res = await handleGatherContext({
      path: root,
      intent: 'x',
      include: ['comprehension'],
      mode: 'detailed',
    });
    const parsed = JSON.parse(res.content[0].text);
    const servedModules = parsed.comprehension.served.map((s: { module: string }) => s.module);
    expect(servedModules).toContain('pkg/a');
    expect(servedModules).toContain('pkg/b'); // no blackout — both good units served
    expect(parsed.comprehension.malformed).toHaveLength(1);
    expect(parsed.comprehension.malformed[0].path).toContain('pkg/bad');
    // degradation is observable in meta.errors
    expect(parsed.meta.errors.some((e: string) => e.includes('pkg/bad'))).toBe(true);
  });

  it('summary mode reports malformedDropped count', async () => {
    const files = { 'a.ts': 'export const a = 1;' };
    await writeModule('m', files);
    await seed(
      'm',
      files,
      computeSourceHash((await createNodeModuleSourceReader(root).readModuleSource('m'))!)
    );
    const badDir = path.join(root, '.harness', 'comprehension', 'bad');
    await fsp.mkdir(badDir, { recursive: true });
    await fsp.writeFile(path.join(badDir, '_module.md'), '---\nmodule: "bad"\n---\nx\n');
    const res = await handleGatherContext({ path: root, intent: 'x', include: ['comprehension'] });
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.comprehension.unitsServed).toBe(1);
    expect(parsed.comprehension.malformedDropped).toBe(1);
  });
});
