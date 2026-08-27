import { describe, it, expect, vi } from 'vitest';
import {
  computeSourceHash,
  renderServedUnit,
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
    if (out.status === 'served') expect(out.recompiled).toBe(true);
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
      unit: string;
    };
    expect(payload.served).toBe(true);
    expect(payload.recompiled).toBe(false);
    expect(payload.unit).toBe(renderServedUnit(store.map.get(module)!));
  });
});
