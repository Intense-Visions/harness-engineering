import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ComprehensionStore,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
} from '@harness-engineering/core';
import { createStaticExtractor } from '../../src/comprehension/static-extractor';
import { enumerateModules } from '../../src/comprehension/invalidation';
import { runComprehend, runComprehendCheck } from '../../src/comprehension/compile-run';
import { pruneOrphanUnits } from '../../src/comprehension/prune';

/**
 * #2578 — an orphan unit (committed `_module.md` whose module directory no longer
 * exists or is no longer enumerable) is reported distinctly by `--check` and
 * deleted by `--prune`. Real adapters over a temp project.
 */
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, content, 'utf-8');
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe('orphan comprehension units (#2578)', () => {
  let root: string;
  let store: ComprehensionStore;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehend-prune-'));
    store = new ComprehensionStore({
      root: `${root.replaceAll('\\', '/')}/.harness/comprehension`,
      io: createNodeComprehensionIO(),
    });
    await writeFile(root, 'pkg/live/a.ts', 'export const a = 1;\n');
    await writeFile(root, 'pkg/gone/b.ts', 'export const b = 2;\n');
    await writeFile(root, 'docs/.vitepress/cache/deps/c.js', 'export const c = 3;\n');
    const reader = createNodeModuleSourceReader(root);
    // Compile all three — the dot-dir one mimics the unit `--changed` used to emit.
    const compiled = await runComprehend({
      mode: 'changed',
      projectRoot: root,
      store,
      reader,
      changedModules: ['pkg/live', 'pkg/gone', 'docs/.vitepress/cache/deps'],
      makeExtractStatic: (module) => createStaticExtractor({ projectRoot: root, module }),
    });
    expect(compiled.compiled).toHaveLength(3);
    // `pkg/gone` is deleted; the VitePress cache is absent in a clean checkout.
    await fsp.rm(path.join(root, 'pkg/gone'), { recursive: true, force: true });
    await fsp.rm(path.join(root, 'docs'), { recursive: true, force: true });
  });
  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  it('--check reports the two orphans distinctly and the live unit as fresh', async () => {
    const reader = createNodeModuleSourceReader(root);
    const result = await runComprehendCheck({
      store,
      reader,
      listModules: () => enumerateModules(root),
    });
    expect(result.orphans).toEqual(['docs/.vitepress/cache/deps', 'pkg/gone']);
    expect(result.stale).toEqual([]);
    expect(result.ok).toBe(false);
  });

  it('--prune deletes exactly the orphan unit files; a normal module unit survives', async () => {
    const pruned = await pruneOrphanUnits({
      store,
      listModules: () => enumerateModules(root),
    });
    expect(pruned.removed).toEqual(['docs/.vitepress/cache/deps', 'pkg/gone']);
    expect(pruned.failed).toEqual([]);
    expect(await exists(store.path('pkg/gone'))).toBe(false);
    expect(await exists(store.path('docs/.vitepress/cache/deps'))).toBe(false);
    expect(await exists(store.path('pkg/live'))).toBe(true);

    const after = await runComprehendCheck({
      store,
      reader: createNodeModuleSourceReader(root),
      listModules: () => enumerateModules(root),
    });
    expect(after.orphans).toEqual([]);
    expect(after.ok).toBe(true);
  });

  it('refuses to unlink a unit whose module would escape the store root', async () => {
    const removed: string[] = [];
    const pruned = await pruneOrphanUnits({
      store: {
        list: async () => ({
          ok: true as const,
          value: {
            units: [{ provenance: { module: '../../etc' } }] as never,
            skipped: [],
          },
        }),
        path: (m: string) => `/root/${m}/_module.md`,
      },
      listModules: async () => [],
      remove: async (p) => {
        removed.push(p);
      },
    });
    expect(removed).toEqual([]);
    expect(pruned.failed).toHaveLength(1);
  });
});
