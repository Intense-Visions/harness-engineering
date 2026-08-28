import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { compileModule } from '../../src/comprehension/compile';
import { computeSourceHash } from '../../src/comprehension/source-hash';
import { serializeUnit } from '../../src/comprehension/serialize';
import { serveGate } from '../../src/comprehension/serve-gate';
import { createNodeModuleSourceReader } from '../../src/comprehension/node-io';
import { ComprehensionStore } from '../../src/comprehension/store';
import { createNodeComprehensionIO } from '../../src/comprehension/node-io';
import type { SourceFile, ExtractStatic, GenerateSemantic } from '../../src/comprehension/types';
import { COMPILER_VERSION } from '../../src/comprehension/types';

// Basename-keyed DIRECT files — exactly what `createNodeModuleSourceReader`
// produces for one module directory (D3). The compiler must consume this shape.
const files: SourceFile[] = [
  { path: 'b.ts', content: 'export const b = 2;' },
  { path: 'a.ts', content: 'export const a = 1;' },
];

const extractStatic: ExtractStatic = () => ({
  interfaceContract: 'export const a: number',
  dependencySlice: 'imports: none',
});

describe('compileModule', () => {
  it('static-only (no generateSemantic): semantic absent, no LLM (SC4)', async () => {
    const unit = await compileModule('src', files, { extractStatic });
    expect(unit.provenance.semantic).toBe('absent');
    expect(unit.provenance.model).toBeNull();
    expect(unit.summary).toBe('');
    expect(unit.invariants).toEqual([]);
    expect(unit.interfaceContract).toBe('export const a: number');
    expect(unit.dependencySlice).toBe('imports: none');
    expect(unit.provenance.sourceHash).toBe(computeSourceHash(files));
    expect(unit.provenance.members).toEqual(['a.ts', 'b.ts']); // sorted basenames (D3)
    expect(unit.provenance.compiler).toEqual(COMPILER_VERSION);
    expect(unit.provenance.compiledAt).toBeUndefined(); // ADR 0109: no wall-clock
  });

  it('always calls extractStatic; never calls a provider when none given', async () => {
    const spy = vi.fn(extractStatic);
    await compileModule('src', files, { extractStatic: spy });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('full: generateSemantic result ⇒ semantic present + model', async () => {
    const gen: GenerateSemantic = () => ({
      summary: 'does things',
      invariants: ['inv1'],
      model: 'claude-haiku',
    });
    const unit = await compileModule('src', files, { extractStatic, generateSemantic: gen });
    expect(unit.provenance.semantic).toBe('present');
    expect(unit.provenance.model).toBe('claude-haiku');
    expect(unit.summary).toBe('does things');
    expect(unit.invariants).toEqual(['inv1']);
  });

  it('generateSemantic returning null ⇒ static-only (no-credential path)', async () => {
    const gen: GenerateSemantic = () => null;
    const unit = await compileModule('src', files, { extractStatic, generateSemantic: gen });
    expect(unit.provenance.semantic).toBe('absent');
    expect(unit.provenance.model).toBeNull();
  });

  it('feeds the static half into the semantic input (static-feeds-semantic)', async () => {
    const gen = vi.fn<GenerateSemantic>(() => null);
    await compileModule('src', files, { extractStatic, generateSemantic: gen });
    expect(gen).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'src',
        interfaceContract: 'export const a: number',
        dependencySlice: 'imports: none',
      })
    );
  });

  // F5 — empty module rejected at compile time (consistent with parseProvenance).
  it('rejects an empty module', async () => {
    await expect(compileModule('', files, { extractStatic })).rejects.toThrow(/module/);
  });

  it('rejects a whitespace-only module', async () => {
    await expect(compileModule('   ', files, { extractStatic })).rejects.toThrow(/module/);
  });

  // D3 — members are BASENAMES of one directory's DIRECT files. A directory
  // prefix on an input collapses to the reader's basename (self-enforcing
  // alignment with createNodeModuleSourceReader). NOTE: the removed F6 test
  // ("same-basename files across subdirs in one module") asserted an IMPOSSIBLE
  // state under D3 — a/index.ts and b/index.ts are SEPARATE modules — and its
  // full-relative-path members could never match the basename-keyed reader,
  // making every unit perpetually source-stale.
  it('keys members by basename (directory prefix collapses to reader basename)', async () => {
    const prefixed: SourceFile[] = [
      { path: 'mod/foo.ts', content: 'export const a = 1;' },
      { path: 'mod/bar.ts', content: 'export const b = 2;' },
    ];
    const unit = await compileModule('mod', prefixed, { extractStatic });
    expect(unit.provenance.members).toEqual(['bar.ts', 'foo.ts']);
  });

  it('de-duplicates identical basenames and normalizes backslashes', async () => {
    const dup: SourceFile[] = [
      { path: 'x\\y.ts', content: 'a' },
      { path: 'y.ts', content: 'a' },
    ];
    const unit = await compileModule('mod', dup, { extractStatic });
    expect(unit.provenance.members).toEqual(['y.ts']);
  });

  // ADR 0109 — byte-stable shards. A unit carries NO wall-clock, so two compiles
  // of the SAME source (at different times / on different branches) are
  // byte-identical and never collide in a merge. This replaces the old C1
  // "reuse-prior-timestamp" determinism, which only suppressed no-op churn but
  // still let two branches making the same change diverge on `compiledAt`.
  it('never stamps compiledAt (no wall-clock in the shard)', async () => {
    const unit = await compileModule('src', files, { extractStatic });
    expect(unit.provenance.compiledAt).toBeUndefined();
  });

  it('is byte-stable across recompiles of identical source', async () => {
    const a = await compileModule('src', files, { extractStatic });
    const b = await compileModule('src', files, { extractStatic });
    expect(a.provenance.sourceHash).toBe(computeSourceHash(files));
    expect(serializeUnit(a)).toBe(serializeUnit(b));
  });
});

// FIX 1 — the single-source-of-truth invariant, end to end. The reader is the
// CANONICAL enumeration; the compiler consumes exactly what it produces; the
// serve gate re-enumerates with the SAME reader and recomputes the hash. If the
// compile-time and serve-time enumerations ever diverged, serve would be false
// forever. This test pins hash EQUALITY across the real compile→store→serve path.
describe('compile → serve hash equality (single source of truth)', () => {
  let root = '';
  afterEach(async () => {
    if (root) await fsp.rm(root, { recursive: true, force: true });
    root = '';
  });

  async function writeSource(module: string, srcFiles: Record<string, string>): Promise<void> {
    const dir = path.join(root, module);
    await fsp.mkdir(dir, { recursive: true });
    for (const [name, content] of Object.entries(srcFiles)) {
      await fsp.writeFile(path.join(dir, name), content);
    }
  }

  it('serves a freshly compiled unit (compile-time hash === serve-time hash)', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'compile-serve-'));
    const module = 'pkg/mod';
    await writeSource(module, {
      'a.ts': 'export const a = 1;',
      'b.ts': 'export const b = 2;',
      'README.md': 'ignored non-source',
    });
    const reader = createNodeModuleSourceReader(root);

    // Enumerate via the CANONICAL reader, then compile exactly that.
    const enumerated = await reader.readModuleSource(module);
    expect(enumerated).not.toBeNull();
    const compiled = await compileModule(module, enumerated!, { extractStatic });
    expect(compiled.provenance.members).toEqual(['a.ts', 'b.ts']);

    const store = new ComprehensionStore({
      root: `${root.replaceAll('\\', '/')}/.harness/comprehension`,
      io: createNodeComprehensionIO(),
    });
    expect((await store.write(compiled)).ok).toBe(true);

    // Serve gate re-enumerates with the SAME reader → must serve.
    const verdict = await serveGate(compiled, reader);
    expect(verdict.serve).toBe(true);
  });

  it('refuses (source-stale) after a content change', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'compile-serve-'));
    const module = 'm';
    await writeSource(module, { 'a.ts': 'export const a = 1;' });
    const reader = createNodeModuleSourceReader(root);
    const compiled = await compileModule(module, (await reader.readModuleSource(module))!, {
      extractStatic,
    });
    await fsp.writeFile(path.join(root, module, 'a.ts'), 'export const a = 999;');
    const verdict = await serveGate(compiled, reader);
    expect(verdict).toEqual({ serve: false, reason: 'source-stale', module, recompile: true });
  });

  it('refuses (source-stale) after adding a file (membership delta)', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'compile-serve-'));
    const module = 'm';
    await writeSource(module, { 'a.ts': 'export const a = 1;' });
    const reader = createNodeModuleSourceReader(root);
    const compiled = await compileModule(module, (await reader.readModuleSource(module))!, {
      extractStatic,
    });
    await fsp.writeFile(path.join(root, module, 'b.ts'), 'export const b = 2;');
    const verdict = await serveGate(compiled, reader);
    expect(verdict.serve).toBe(false);
  });

  it('refuses (source-stale) after removing a file (membership delta)', async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'compile-serve-'));
    const module = 'm';
    await writeSource(module, { 'a.ts': 'export const a = 1;', 'b.ts': 'export const b = 2;' });
    const reader = createNodeModuleSourceReader(root);
    const compiled = await compileModule(module, (await reader.readModuleSource(module))!, {
      extractStatic,
    });
    await fsp.rm(path.join(root, module, 'b.ts'));
    const verdict = await serveGate(compiled, reader);
    expect(verdict.serve).toBe(false);
  });
});
