import { describe, it, expect } from 'vitest';
import { createComprehendCommand, resolveMode } from '../../src/commands/comprehend';

describe('createComprehendCommand', () => {
  it('returns a Command named "comprehend" with the four mode flags', () => {
    const cmd = createComprehendCommand();
    expect(cmd.name()).toBe('comprehend');
    const flags = cmd.options.map((o) => o.long);
    expect(flags).toContain('--changed');
    expect(flags).toContain('--all');
    expect(flags).toContain('--check');
    expect(flags).toContain('--stats');
  });
});

describe('resolveMode — flag precedence', () => {
  it('defaults to changed with no flag', () => {
    expect(resolveMode({})).toBe('changed');
    expect(resolveMode({ changed: true })).toBe('changed');
  });
  it('honors precedence check > stats > all > changed', () => {
    expect(resolveMode({ check: true, stats: true, all: true })).toBe('check');
    expect(resolveMode({ stats: true, all: true })).toBe('stats');
    expect(resolveMode({ all: true })).toBe('all');
  });
});

// --- Task 9: real-adapter end-to-end (compile -> serve -> --check -> --stats) --

import { beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ComprehensionStore,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
  serveGate,
} from '@harness-engineering/core';
import { createStaticExtractor } from '../../src/comprehension/static-extractor';
import { enumerateModules } from '../../src/comprehension/invalidation';
import {
  runComprehend,
  runComprehendCheck,
  runComprehendStats,
} from '../../src/comprehension/compile-run';

describe('comprehend end-to-end (real node adapters, token-free)', () => {
  let projectRoot: string;
  let store: ComprehensionStore;
  let reader: ReturnType<typeof createNodeModuleSourceReader>;

  beforeEach(async () => {
    projectRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'comprehend-e2e-'));
    await fsp.mkdir(path.join(projectRoot, 'pkg', 'm'), { recursive: true });
    await fsp.writeFile(
      path.join(projectRoot, 'pkg', 'm', 'index.ts'),
      "export { foo } from './a';\n",
      'utf-8'
    );
    await fsp.writeFile(
      path.join(projectRoot, 'pkg', 'm', 'a.ts'),
      "import { createHash } from 'node:crypto';\nexport function foo() {\n  return createHash('sha256');\n}\n",
      'utf-8'
    );
    // A substantive non-barrel member: its large body inflates the RAW source
    // while the barrel-anchored served form stays compact — the realistic case
    // where the compiled unit is materially cheaper than the raw source (SC6).
    const bigBody = Array.from(
      { length: 80 },
      (_, i) =>
        `  // implementation detail line ${i} — verbose internal logic not on the public surface`
    ).join('\n');
    await fsp.writeFile(
      path.join(projectRoot, 'pkg', 'm', 'c.ts'),
      `function internalHelper() {\n${bigBody}\n  return 0;\n}\n`,
      'utf-8'
    );
    store = new ComprehensionStore({
      root: path.join(projectRoot, '.harness', 'comprehension'),
      io: createNodeComprehensionIO(),
    });
    reader = createNodeModuleSourceReader(projectRoot);
  });
  afterEach(async () => {
    await fsp.rm(projectRoot, { recursive: true, force: true });
  });

  it('compiles via the canonical reader, writes a unit, and serves it immediately (Truth 4)', async () => {
    // NO generateSemantic → token-free, static-only (SC4).
    const result = await runComprehend({
      mode: 'all',
      projectRoot,
      store,
      reader,
      makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
      listModules: () => enumerateModules(projectRoot),
      env: {},
    });
    expect(result.compiled).toContain('pkg/m');

    // A committed _module.md exists and parses.
    const unitPath = path.join(projectRoot, '.harness', 'comprehension', 'pkg', 'm', '_module.md');
    const raw = await fsp.readFile(unitPath, 'utf-8');
    expect(raw).toContain('pkg/m');

    // PINNED INVARIANT: compile-time hash == serve-time hash (same canonical reader).
    const read = await store.read('pkg/m');
    expect(read.ok).toBe(true);
    if (read.ok) {
      const verdict = await serveGate(read.value, reader);
      expect(verdict.serve).toBe(true);
    }
  });

  it('SC4: every written unit is semantic: absent with no provider', async () => {
    const result = await runComprehend({
      mode: 'all',
      projectRoot,
      store,
      reader,
      makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
      listModules: () => enumerateModules(projectRoot),
      env: {},
    });
    expect(result.semanticPresent).toBe(0);
    expect(result.semanticAbsent).toBeGreaterThan(0);
    const read = await store.read('pkg/m');
    if (read.ok) expect(read.value.provenance.semantic).toBe('absent');
  });

  it('--check flags a mutated module stale and reports ok:false (SC2)', async () => {
    await runComprehend({
      mode: 'all',
      projectRoot,
      store,
      reader,
      makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
      listModules: () => enumerateModules(projectRoot),
      env: {},
    });
    // mutate source on disk → serve-time hash diverges
    await fsp.writeFile(
      path.join(projectRoot, 'pkg', 'm', 'a.ts'),
      'export function foo() {\n  return 999;\n}\n',
      'utf-8'
    );
    const check = await runComprehendCheck({ store, reader });
    expect(check.stale).toContain('pkg/m');
    expect(check.ok).toBe(false);
  });

  it('--stats reports positive savings on the fresh substrate (SC6)', async () => {
    await runComprehend({
      mode: 'all',
      projectRoot,
      store,
      reader,
      makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
      listModules: () => enumerateModules(projectRoot),
      env: {},
    });
    const stats = await runComprehendStats({ store, reader });
    expect(stats.savedTokens).toBeGreaterThan(0);
    expect(stats.savedPct).toBeGreaterThan(0);
  });

  // C1 — two consecutive `--all` runs over an UNCHANGED source tree must produce
  // BYTE-IDENTICAL unit files. Before the fix, `compiledAt: now()` moved on every
  // run and rewrote the committed unit, churning git on every no-op compile.
  it('C1: repeated --all over unchanged source is byte-identical and skips-fresh (zero churn)', async () => {
    const runAll = () =>
      runComprehend({
        mode: 'all',
        projectRoot,
        store,
        reader,
        makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
        listModules: () => enumerateModules(projectRoot),
        env: {},
      });
    const unitPath = path.join(projectRoot, '.harness', 'comprehension', 'pkg', 'm', '_module.md');

    const first = await runAll();
    expect(first.compiled).toContain('pkg/m');
    const bytesAfterFirst = await fsp.readFile(unitPath); // Buffer

    const second = await runAll();
    // The second run recompiles NOTHING — every module reports skipped-fresh.
    expect(second.compiled).toEqual([]);
    expect(second.fresh).toContain('pkg/m');
    const bytesAfterSecond = await fsp.readFile(unitPath);

    expect(bytesAfterSecond.equals(bytesAfterFirst)).toBe(true); // BYTE-identical
  });

  it('SC3: the recompiled set equals the changed-module set (not the repo)', async () => {
    // Two modules exist; a "changed" run scoped to only pkg/m must recompile only it.
    await fsp.mkdir(path.join(projectRoot, 'pkg', 'other'), { recursive: true });
    await fsp.writeFile(
      path.join(projectRoot, 'pkg', 'other', 'b.ts'),
      'export const b = 2;\n',
      'utf-8'
    );
    const changedModules = ['pkg/m'];
    const result = await runComprehend({
      mode: 'changed',
      projectRoot,
      store,
      reader,
      makeExtractStatic: (module) => createStaticExtractor({ projectRoot, module }),
      changedModules,
      env: {},
    });
    expect(result.compiled).toEqual(changedModules); // recompiled-set === changed-set
    // pkg/other was NOT compiled
    const other = await store.read('pkg/other');
    expect(other.ok).toBe(false);
  });
});
