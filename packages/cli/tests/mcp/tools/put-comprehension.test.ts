import { describe, it, expect } from 'vitest';
import {
  compileModule,
  Ok,
  Err,
  type ComprehensionUnit,
  type ComprehensionSourceFile,
  type ExtractStatic,
  type Result,
} from '@harness-engineering/core';
import {
  attachSemantic,
  handlePutComprehension,
  type AttachSemanticDeps,
} from '../../../src/mcp/tools/put-comprehension';

const MODULE = 'pkg/a';
const SRC: ComprehensionSourceFile[] = [{ path: 'a.ts', content: 'export const a = 1;' }];
const extractStatic: ExtractStatic = () => ({
  interfaceContract: 'export const a: number',
  dependencySlice: 'imports: none',
});

/** Compile a source-fresh static (semantic:absent) unit for MODULE. */
async function staticUnit(files = SRC): Promise<ComprehensionUnit> {
  return compileModule(MODULE, files, { extractStatic });
}

/** A store seeded with an optional committed unit; records writes. */
function fakeStore(seed?: ComprehensionUnit) {
  const writes: ComprehensionUnit[] = [];
  return {
    writes,
    read: async (module: string): Promise<Result<ComprehensionUnit>> =>
      seed && module === MODULE ? Ok(seed) : Err(new Error('not found')),
    write: async (unit: ComprehensionUnit): Promise<Result<void>> => {
      writes.push(unit);
      return Ok(undefined);
    },
  };
}

/** A reader returning the given source (drives serveGate's freshness recompute). */
function fakeReader(files: ComprehensionSourceFile[] | null) {
  return { readModuleSource: async () => files };
}

const payload = {
  summary: 'Manages the thing.',
  invariants: ['must stay sorted', 'never negative'],
};

describe('attachSemantic', () => {
  it('attaches semantic onto a source-fresh static unit and re-serves it', async () => {
    const unit = await staticUnit();
    expect(unit.provenance.semantic).toBe('absent');
    const store = fakeStore(unit);
    const deps: AttachSemanticDeps = { store, reader: fakeReader(SRC) };

    const outcome = await attachSemantic(MODULE, { ...payload, model: 'test-agent' }, deps);

    expect(outcome.status).toBe('written');
    expect(store.writes).toHaveLength(1);
    const written = store.writes[0];
    expect(written.provenance.semantic).toBe('present');
    expect(written.provenance.model).toBe('test-agent');
    expect(written.summary).toBe(payload.summary);
    expect(written.invariants).toEqual(payload.invariants);
    // Static provenance is preserved verbatim (same source → same hash/members).
    expect(written.provenance.sourceHash).toBe(unit.provenance.sourceHash);
    expect(written.provenance.members).toEqual(unit.provenance.members);
  });

  it('refuses when no unit exists (compile the static unit first)', async () => {
    const deps: AttachSemanticDeps = { store: fakeStore(), reader: fakeReader(SRC) };
    const outcome = await attachSemantic(MODULE, payload, deps);
    expect(outcome.status).toBe('unavailable');
    expect(store_never_written(deps)).toBe(true);
  });

  it('refuses when the unit is source-stale (recompile first)', async () => {
    const unit = await staticUnit();
    const store = fakeStore(unit);
    // Reader now returns DIFFERENT source ⇒ serveGate recomputes a mismatched hash.
    const deps: AttachSemanticDeps = {
      store,
      reader: fakeReader([{ path: 'a.ts', content: 'export const a = 999;' }]),
    };
    const outcome = await attachSemantic(MODULE, payload, deps);
    expect(outcome.status).toBe('stale');
    expect(store.writes).toHaveLength(0);
  });

  it('rejects an empty summary (authority-in-TS)', async () => {
    const unit = await staticUnit();
    const store = fakeStore(unit);
    const deps: AttachSemanticDeps = { store, reader: fakeReader(SRC) };
    const outcome = await attachSemantic(MODULE, { summary: '   ', invariants: [] }, deps);
    expect(outcome.status).toBe('invalid');
    expect(store.writes).toHaveLength(0);
  });

  it('accepts empty invariants (a trivial module may have none)', async () => {
    const unit = await staticUnit();
    const store = fakeStore(unit);
    const deps: AttachSemanticDeps = { store, reader: fakeReader(SRC) };
    const outcome = await attachSemantic(MODULE, { summary: 'trivial', invariants: [] }, deps);
    expect(outcome.status).toBe('written');
    expect(store.writes[0].invariants).toEqual([]);
    expect(store.writes[0].provenance.model).toBeNull(); // no model provided
  });
});

function store_never_written(deps: AttachSemanticDeps): boolean {
  return (deps.store as ReturnType<typeof fakeStore>).writes.length === 0;
}

describe('handlePutComprehension (envelope)', () => {
  it('returns written:true with the enriched unit on success', async () => {
    const unit = await staticUnit();
    const deps: AttachSemanticDeps = { store: fakeStore(unit), reader: fakeReader(SRC) };
    const res = await handlePutComprehension(
      { path: '/repo', module: MODULE, summary: payload.summary, invariants: payload.invariants },
      deps
    );
    expect(res.isError).toBeUndefined();
    const body = JSON.parse(res.content[0].text);
    expect(body).toMatchObject({ module: MODULE, written: true, semantic: 'present' });
    expect(body.unit).toContain(payload.summary);
  });

  it('returns written:false with a reason when the unit is missing', async () => {
    const deps: AttachSemanticDeps = { store: fakeStore(), reader: fakeReader(SRC) };
    const res = await handlePutComprehension(
      { path: '/repo', module: MODULE, summary: 's', invariants: [] },
      deps
    );
    const body = JSON.parse(res.content[0].text);
    expect(body.written).toBe(false);
    expect(body.reason).toMatch(/get_comprehension/);
  });

  it('is an isError envelope when required fields are malformed', async () => {
    const res = await handlePutComprehension(
      // @ts-expect-error — intentionally malformed to exercise the guard
      { path: '/repo', module: MODULE, summary: 42, invariants: 'nope' },
      { store: fakeStore(), reader: fakeReader(SRC) }
    );
    expect(res.isError).toBe(true);
  });
});
