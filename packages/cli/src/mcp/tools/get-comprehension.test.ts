import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import {
  computeSourceHash,
  renderServedUnit,
  ComprehensionStore,
  createNodeComprehensionIO,
  createNodeModuleSourceReader,
  Ok,
  Err,
  type ComprehensionUnit,
  type ComprehensionSourceFile as SourceFile,
  type StaticExtraction,
  type Result,
} from '@harness-engineering/core';
import {
  getComprehensionDefinition,
  handleGetComprehension,
  serveOrRecompile,
  type ServeOrRecompileDeps,
} from './get-comprehension';

const HARNESS_ACTIVE = 'HARNESS_COMPREHENSION_ACTIVE';

/** A minimal in-memory unit store keyed by module (no disk). */
function fakeStore(seed: Record<string, ComprehensionUnit> = {}) {
  const map = new Map<string, ComprehensionUnit>(Object.entries(seed));
  const writes: string[] = [];
  return {
    map,
    writes,
    async read(module: string): Promise<Result<ComprehensionUnit>> {
      const u = map.get(module);
      return u ? Ok(u) : Err(new Error(`no unit for ${module}`));
    },
    async write(unit: ComprehensionUnit): Promise<Result<void>> {
      map.set(unit.provenance.module, unit);
      writes.push(unit.provenance.module);
      return Ok(undefined);
    },
    path: (module: string) => `.harness/comprehension/${module}/_module.md`,
  };
}

/** A reader returning fixed source per module (or null when the dir is gone). */
function fakeReader(sources: Record<string, SourceFile[] | null>) {
  return {
    async readModuleSource(module: string): Promise<SourceFile[] | null> {
      return module in sources ? sources[module]! : null;
    },
  };
}

const staticExtraction: StaticExtraction = {
  interfaceContract: 'export function foo(): void',
  dependencySlice: 'imports: none',
};

/** Build a fresh (serveable) unit whose sourceHash matches the given source. */
function freshUnit(module: string, source: SourceFile[]): ComprehensionUnit {
  return {
    provenance: {
      schemaVersion: 1,
      module,
      sourceHash: computeSourceHash(source),
      compiledAt: '2026-08-27T00:00:00.000Z',
      compiler: { static: '1.0.0', semantic: '1.0.0' },
      model: null,
      semantic: 'absent',
      members: source.map((f) => f.path),
    },
    summary: '',
    invariants: [],
    interfaceContract: 'stale-contract',
    dependencySlice: 'stale-deps',
  };
}

function deps(over: Partial<ServeOrRecompileDeps>): ServeOrRecompileDeps {
  return {
    store: fakeStore(),
    reader: fakeReader({}),
    makeExtractStatic: () => () => staticExtraction,
    projectRoot: '/repo',
    concurrency: 1,
    env: {},
    ...over,
  } as ServeOrRecompileDeps;
}

describe('serveOrRecompile — SF3.1 (D6 leaf-demand serve/recompile)', () => {
  const module = 'packages/core/src';
  const source: SourceFile[] = [{ path: 'a.ts', content: 'export const a = 1;' }];

  it('(a) a FRESH unit serves via serveGate — rendered, NOT recompiled', async () => {
    const store = fakeStore({ [module]: freshUnit(module, source) });
    const extract = vi.fn(() => staticExtraction);
    const out = await serveOrRecompile(
      module,
      false,
      deps({
        store,
        reader: fakeReader({ [module]: source }),
        makeExtractStatic: () => extract,
      })
    );
    expect(out.status).toBe('served');
    if (out.status === 'served') {
      expect(out.recompiled).toBe(false);
      expect(out.semantic).toBe('absent'); // static-only ⇒ semanticNeeded downstream
      expect(out.rendered).toBe(renderServedUnit(store.map.get(module)!));
    }
    expect(extract).not.toHaveBeenCalled(); // no recompile for a fresh serve
    expect(store.writes).toEqual([]);
  });

  it('(b) a SOURCE-STALE unit recompiles that one module, then serves the fresh unit', async () => {
    const staleSource: SourceFile[] = [{ path: 'a.ts', content: 'export const a = 999;' }];
    const store = fakeStore({ [module]: freshUnit(module, source) }); // hash for OLD source
    const extract = vi.fn(() => staticExtraction);
    const out = await serveOrRecompile(
      module,
      false,
      deps({
        store,
        reader: fakeReader({ [module]: staleSource }), // source moved ⇒ stale
        makeExtractStatic: () => extract,
      })
    );
    expect(out.status).toBe('served');
    if (out.status === 'served') {
      expect(out.recompiled).toBe(true);
      expect(out.semantic).toBe('absent'); // recompiled static-only (no provider in test)
    }
    expect(extract).toHaveBeenCalledOnce();
    expect(store.writes).toEqual([module]); // exactly that one module recompiled
    expect(store.map.get(module)!.interfaceContract).toBe(staticExtraction.interfaceContract);
  });

  it('(c) forceRecompile:true recompiles even a fresh unit', async () => {
    const store = fakeStore({ [module]: freshUnit(module, source) });
    const extract = vi.fn(() => staticExtraction);
    const out = await serveOrRecompile(
      module,
      /* forceRecompile */ true,
      deps({
        store,
        reader: fakeReader({ [module]: source }),
        makeExtractStatic: () => extract,
      })
    );
    expect(out.status).toBe('served');
    if (out.status === 'served') expect(out.recompiled).toBe(true);
    expect(extract).toHaveBeenCalledOnce();
  });

  it('(d) a recompile refuses when a comprehension run is already active (reentrancy-guarded)', async () => {
    const store = fakeStore(); // no unit ⇒ recompile path
    const out = await serveOrRecompile(
      module,
      false,
      deps({
        store,
        reader: fakeReader({ [module]: source }),
        env: { [HARNESS_ACTIVE]: '1' }, // simulate an in-flight run
      })
    );
    expect(out.status).toBe('reentrant');
    expect(store.writes).toEqual([]); // no compile, no write while reentrant
  });

  it('(e) a module with no unit AND no source yields a structured unavailable (never throws)', async () => {
    const out = await serveOrRecompile(
      'packages/gone/src',
      false,
      deps({
        store: fakeStore(),
        reader: fakeReader({}), // no source for anything
      })
    );
    expect(out.status).toBe('unavailable');
  });

  // --- FIX C: the semantic provider is resolved LAZILY (recompile branch only) --
  it('(f) a FRESH serve does NOT resolve the semantic provider (lazy provider)', async () => {
    const store = fakeStore({ [module]: freshUnit(module, source) });
    const resolveGenerateSemantic = vi.fn(async () => undefined);
    const out = await serveOrRecompile(
      module,
      false,
      deps({
        store,
        reader: fakeReader({ [module]: source }),
        resolveGenerateSemantic,
      })
    );
    expect(out.status).toBe('served');
    if (out.status === 'served') expect(out.recompiled).toBe(false);
    // The pure fresh serve never touches the provider resolver (no config load /
    // PATH scan on the hot serve path).
    expect(resolveGenerateSemantic).not.toHaveBeenCalled();
  });

  it('(g) a RECOMPILE resolves the semantic provider exactly once (lazy provider)', async () => {
    const store = fakeStore(); // no unit ⇒ recompile path
    const resolveGenerateSemantic = vi.fn(async () => undefined);
    const out = await serveOrRecompile(
      module,
      false,
      deps({
        store,
        reader: fakeReader({ [module]: source }),
        makeExtractStatic: () => () => staticExtraction,
        resolveGenerateSemantic,
      })
    );
    expect(out.status).toBe('served');
    if (out.status === 'served') expect(out.recompiled).toBe(true);
    expect(resolveGenerateSemantic).toHaveBeenCalledOnce();
  });
});

describe('get_comprehension MCP envelope', () => {
  it('definition names the tool and requires module', () => {
    expect(getComprehensionDefinition.name).toBe('get_comprehension');
    expect(getComprehensionDefinition.inputSchema.required).toContain('module');
    expect(getComprehensionDefinition.inputSchema.required).toContain('path');
  });

  it('returns an isError envelope (not a throw) when module is missing', async () => {
    const res = await handleGetComprehension({ path: '/repo' } as { path: string; module: string });
    expect(res.isError).toBe(true);
  });

  it('serves a fresh unit through the handler envelope', async () => {
    const module = 'm';
    const source: SourceFile[] = [{ path: 'a.ts', content: 'x' }];
    const store = fakeStore({ [module]: freshUnit(module, source) });
    const res = await handleGetComprehension(
      { path: '/repo', module },
      deps({ store, reader: fakeReader({ [module]: source }) })
    );
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0]!.text) as {
      served: boolean;
      recompiled: boolean;
      semanticNeeded: boolean;
      unit: string;
    };
    expect(payload.served).toBe(true);
    expect(payload.recompiled).toBe(false);
    // ADR 0109 slice 2 — a static-only served unit signals the agent to enrich it.
    expect(payload.semanticNeeded).toBe(true);
    expect(payload.unit).toBe(renderServedUnit(store.map.get(module)!));
  });

  it('emits semanticNeeded:false when the served unit already has semantic', async () => {
    const module = 'm';
    const source: SourceFile[] = [{ path: 'a.ts', content: 'x' }];
    const present = freshUnit(module, source);
    present.provenance.semantic = 'present';
    present.summary = 'Does the thing.';
    present.invariants = ['stays sorted'];
    const store = fakeStore({ [module]: present });
    const res = await handleGetComprehension(
      { path: '/repo', module },
      deps({ store, reader: fakeReader({ [module]: source }) })
    );
    const payload = JSON.parse(res.content[0]!.text) as { semanticNeeded: boolean };
    expect(payload.semanticNeeded).toBe(false);
  });
});

/**
 * FIX 1 seam — store-root vs reader-root divergence under cwd != project root.
 *
 * Exercises the REAL disk-backed deps (no injected mocks) via the default deps
 * path, with `process.cwd()` deliberately DIFFERENT from the project root. Before
 * the fix the store defaulted to `COMPREHENSION_ROOT` resolved against cwd while
 * the reader was rooted at the project root, so a committed fresh unit was NOT
 * found — the serve silently fell through to a recompile (or blanked). After the
 * fix the store is rooted absolutely at the project root, so the committed unit is
 * found and served directly (`recompiled: false`).
 */
describe('handleGetComprehension — cwd != project root seam (FIX 1)', () => {
  const originalCwd = process.cwd();
  afterEach(() => process.chdir(originalCwd));

  it('serves the committed unit from an ABSOLUTE project root even when cwd differs', async () => {
    // A real project tree with a real source file + a real committed unit.
    const projectRoot = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'comp-seam-cli-'));
    const cwdElsewhere = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'comp-seam-cwd-'));
    const module = 'src/widget';
    fs.mkdirSync(nodePath.join(projectRoot, module), { recursive: true });
    fs.writeFileSync(
      nodePath.join(projectRoot, module, 'widget.ts'),
      'export const widget = () => 42;\n',
      'utf-8'
    );

    // Compile a fresh unit through the SAME canonical reader the serve gate uses,
    // then commit it via the REAL node store rooted ABSOLUTELY at the project root.
    const reader = createNodeModuleSourceReader(projectRoot);
    const source = (await reader.readModuleSource(module))!;
    const store = new ComprehensionStore({
      root: `${projectRoot.replaceAll('\\', '/')}/.harness/comprehension`,
      io: createNodeComprehensionIO(),
    });
    const unit: ComprehensionUnit = {
      provenance: {
        schemaVersion: 1,
        module,
        sourceHash: computeSourceHash(source),
        compiledAt: '2026-08-27T00:00:00.000Z',
        compiler: { static: '1.0.0', semantic: '1.0.0' },
        model: null,
        semantic: 'absent',
        members: source.map((f) => f.path),
      },
      summary: 'the committed widget summary',
      invariants: [],
      interfaceContract: 'export const widget: () => number',
      dependencySlice: 'imports: none',
    };
    expect((await store.write(unit)).ok).toBe(true);

    // The bug's trigger: run with cwd pointed AWAY from the project root.
    process.chdir(cwdElsewhere);
    expect(process.cwd()).not.toBe(projectRoot);

    // No injected deps → the handler resolves the REAL disk-backed default deps.
    const res = await handleGetComprehension({ path: projectRoot, module });
    expect(res.isError).toBeFalsy();
    const payload = JSON.parse(res.content[0]!.text) as {
      served: boolean;
      recompiled: boolean;
      unit: string;
    };
    // Served directly from the committed unit — NOT recompiled (which is what the
    // divergent store root would have forced by never finding the committed unit).
    expect(payload.served).toBe(true);
    expect(payload.recompiled).toBe(false);
    expect(payload.unit).toContain('export const widget: () => number');
  });
});
