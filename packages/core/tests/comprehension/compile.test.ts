import { describe, it, expect, vi } from 'vitest';
import { compileModule } from '../../src/comprehension/compile';
import { computeSourceHash } from '../../src/comprehension/source-hash';
import type { SourceFile, ExtractStatic, GenerateSemantic } from '../../src/comprehension/types';
import { COMPILER_VERSION } from '../../src/comprehension/types';

const files: SourceFile[] = [
  { path: 'src/b.ts', content: 'export const b = 2;' },
  { path: 'src/a.ts', content: 'export const a = 1;' },
];

const extractStatic: ExtractStatic = () => ({
  interfaceContract: 'export const a: number',
  dependencySlice: 'imports: none',
});

const now = () => new Date('2026-08-27T12:00:00.000Z');

describe('compileModule', () => {
  it('static-only (no generateSemantic): semantic absent, no LLM (SC4)', async () => {
    const unit = await compileModule('src', files, { extractStatic, now });
    expect(unit.provenance.semantic).toBe('absent');
    expect(unit.provenance.model).toBeNull();
    expect(unit.summary).toBe('');
    expect(unit.invariants).toEqual([]);
    expect(unit.interfaceContract).toBe('export const a: number');
    expect(unit.dependencySlice).toBe('imports: none');
    expect(unit.provenance.sourceHash).toBe(computeSourceHash(files));
    expect(unit.provenance.members).toEqual(['src/a.ts', 'src/b.ts']); // sorted relative paths (F6)
    expect(unit.provenance.compiler).toEqual(COMPILER_VERSION);
    expect(unit.provenance.compiledAt).toBe('2026-08-27T12:00:00.000Z');
  });

  it('always calls extractStatic; never calls a provider when none given', async () => {
    const spy = vi.fn(extractStatic);
    await compileModule('src', files, { extractStatic: spy, now });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('full: generateSemantic result ⇒ semantic present + model', async () => {
    const gen: GenerateSemantic = () => ({
      summary: 'does things',
      invariants: ['inv1'],
      model: 'claude-haiku',
    });
    const unit = await compileModule('src', files, { extractStatic, generateSemantic: gen, now });
    expect(unit.provenance.semantic).toBe('present');
    expect(unit.provenance.model).toBe('claude-haiku');
    expect(unit.summary).toBe('does things');
    expect(unit.invariants).toEqual(['inv1']);
  });

  it('generateSemantic returning null ⇒ static-only (no-credential path)', async () => {
    const gen: GenerateSemantic = () => null;
    const unit = await compileModule('src', files, { extractStatic, generateSemantic: gen, now });
    expect(unit.provenance.semantic).toBe('absent');
    expect(unit.provenance.model).toBeNull();
  });

  it('feeds the static half into the semantic input (static-feeds-semantic)', async () => {
    const gen = vi.fn<GenerateSemantic>(() => null);
    await compileModule('src', files, { extractStatic, generateSemantic: gen, now });
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
    await expect(compileModule('', files, { extractStatic, now })).rejects.toThrow(/module/);
  });

  it('rejects a whitespace-only module', async () => {
    await expect(compileModule('   ', files, { extractStatic, now })).rejects.toThrow(/module/);
  });

  // F6 — members keyed by relative path, so same-basename files in different
  // subdirs are both reported (was silently deduped by basename).
  it('reports same-basename files in different subdirs (keyed by relative path)', async () => {
    const collided: SourceFile[] = [
      { path: 'a/index.ts', content: 'export const a = 1;' },
      { path: 'b/index.ts', content: 'export const b = 2;' },
    ];
    const unit = await compileModule('mod', collided, { extractStatic, now });
    expect(unit.provenance.members).toEqual(['a/index.ts', 'b/index.ts']);
  });

  it('de-duplicates identical relative paths and normalizes backslashes', async () => {
    const dup: SourceFile[] = [
      { path: 'x\\y.ts', content: 'a' },
      { path: 'x/y.ts', content: 'a' },
    ];
    const unit = await compileModule('mod', dup, { extractStatic, now });
    expect(unit.provenance.members).toEqual(['x/y.ts']);
  });
});
