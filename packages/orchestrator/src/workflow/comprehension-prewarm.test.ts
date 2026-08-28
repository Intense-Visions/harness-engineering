import { describe, it, expect, vi } from 'vitest';
import {
  computeSourceHash,
  renderServedUnit,
  Ok,
  Err,
  type ComprehensionUnit,
  type ComprehensionSourceFile as SourceFile,
  type Result,
} from '@harness-engineering/core';
import type { Issue } from '@harness-engineering/types';
import {
  deriveSeedModules,
  resolveLeafPrewarm,
  type LeafPrewarmDeps,
} from './comprehension-prewarm';

function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: 'iss-1',
    identifier: 'ISS-1',
    title: 'Do the thing',
    description: null,
    priority: null,
    state: 'planned',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: null,
    updatedAt: null,
    externalId: null,
    ...over,
  };
}

function fakeStore(seed: Record<string, ComprehensionUnit>) {
  return {
    async read(module: string): Promise<Result<ComprehensionUnit>> {
      const u = seed[module];
      return u ? Ok(u) : Err(new Error(`no unit for ${module}`));
    },
  };
}

function fakeReader(sources: Record<string, SourceFile[] | null>) {
  return {
    async readModuleSource(module: string): Promise<SourceFile[] | null> {
      return module in sources ? sources[module]! : null;
    },
  };
}

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
    interfaceContract: `contract for ${module}`,
    dependencySlice: 'deps',
  };
}

describe('deriveSeedModules — SF4.1 minimal seed (issue-referenced modules)', () => {
  it('extracts module directories from file paths mentioned in title/description', () => {
    const seed = deriveSeedModules(
      issue({
        title: 'Fix packages/core/src/foo.ts',
        description: 'Also touches packages/cli/src/bar.ts and packages/cli/src',
      })
    );
    expect(seed).toContain('packages/core/src');
    expect(seed).toContain('packages/cli/src');
  });

  it('includes the spec/plan file directories', () => {
    const seed = deriveSeedModules(
      issue({ spec: 'docs/changes/x/proposal.md', plans: ['docs/changes/x/plans/p.md'] })
    );
    expect(seed).toContain('docs/changes/x');
    expect(seed).toContain('docs/changes/x/plans');
  });

  it('returns an empty seed when no path-like references exist (graceful)', () => {
    expect(deriveSeedModules(issue({ title: 'no paths here', description: 'nothing' }))).toEqual(
      []
    );
  });
});

describe('resolveLeafPrewarm — SF4.1', () => {
  const source: SourceFile[] = [{ path: 'a.ts', content: 'export const a = 1;' }];
  const module = 'packages/core/src';

  function deps(over: Partial<LeafPrewarmDeps>): LeafPrewarmDeps {
    return {
      projectRoot: '/repo',
      store: fakeStore({}),
      reader: fakeReader({}),
      ...over,
    } as LeafPrewarmDeps;
  }

  it('(a) renders a block of ONLY fresh (serveGate-passing) units for the seed modules', async () => {
    const res = await resolveLeafPrewarm(
      issue({ title: `edit ${module}/a.ts` }),
      deps({
        store: fakeStore({ [module]: freshUnit(module, source) }),
        reader: fakeReader({ [module]: source }),
      })
    );
    expect(res.block).toContain(renderServedUnit(freshUnit(module, source)));
    expect(res.block).toContain(`contract for ${module}`);
  });

  it('(b) reports a sources breakdown ({label, tokens}) over renderServedUnit', async () => {
    const res = await resolveLeafPrewarm(
      issue({ title: `edit ${module}/a.ts` }),
      deps({
        store: fakeStore({ [module]: freshUnit(module, source) }),
        reader: fakeReader({ [module]: source }),
      })
    );
    expect(res.sources).toHaveLength(1);
    expect(res.sources[0]!.label).toBe(module);
    const expectedTokens = Math.ceil(renderServedUnit(freshUnit(module, source)).length / 4);
    expect(res.sources[0]!.tokens).toBe(expectedTokens);
  });

  it('(c) returns an EMPTY block + empty sources when nothing is fresh/available (graceful)', async () => {
    const res = await resolveLeafPrewarm(
      issue({ title: `edit ${module}/a.ts` }),
      deps({ store: fakeStore({}), reader: fakeReader({}) })
    );
    expect(res.block).toBe('');
    expect(res.sources).toEqual([]);
  });

  it('(d) excludes source-stale units (serveGate refuses)', async () => {
    const staleSource: SourceFile[] = [{ path: 'a.ts', content: 'changed!' }];
    const res = await resolveLeafPrewarm(
      issue({ title: `edit ${module}/a.ts` }),
      deps({
        store: fakeStore({ [module]: freshUnit(module, source) }), // hash for OLD source
        reader: fakeReader({ [module]: staleSource }), // source moved ⇒ stale
      })
    );
    expect(res.block).toBe('');
    expect(res.sources).toEqual([]);
  });

  it('(e) never throws and never calls an LLM (store/serve failures degrade to empty)', async () => {
    const throwingStore = {
      async read(): Promise<Result<ComprehensionUnit>> {
        throw new Error('disk blew up');
      },
    };
    const res = await resolveLeafPrewarm(
      issue({ title: `edit ${module}/a.ts` }),
      deps({ store: throwingStore, reader: fakeReader({ [module]: source }) })
    );
    expect(res).toEqual({ block: '', sources: [] });
  });

  it('optionally enriches with direct deps when a resolver is provided (graph-present path)', async () => {
    const dep = 'packages/types/src';
    const resolveDirectDeps = vi.fn((m: string) => (m === module ? [dep] : []));
    const res = await resolveLeafPrewarm(
      issue({ title: `edit ${module}/a.ts` }),
      deps({
        store: fakeStore({
          [module]: freshUnit(module, source),
          [dep]: freshUnit(dep, source),
        }),
        reader: fakeReader({ [module]: source, [dep]: source }),
        resolveDirectDeps,
      })
    );
    expect(res.sources.map((s) => s.label).sort()).toEqual([dep, module].sort());
    expect(resolveDirectDeps).toHaveBeenCalled();
  });
});
