import { describe, it, expect, afterEach } from 'vitest';
import { Ok } from '@harness-engineering/core';
import type {
  ComprehensionUnit,
  ComprehensionSourceFile,
  ExtractStatic,
  GenerateSemantic,
} from '@harness-engineering/core';
import { runComprehend, mapWithConcurrency } from '../../src/comprehension/compile-run';
import {
  REENTRANCY_ENV,
  isComprehensionReentrant,
} from '../../src/comprehension/generate-semantic';

// --- fakes -----------------------------------------------------------------

function fakeReader(map: Record<string, ComprehensionSourceFile[] | null>) {
  return {
    readModuleSource: async (module: string) => map[module] ?? null,
  };
}

function fakeStore() {
  const writes: ComprehensionUnit[] = [];
  return {
    writes,
    write: async (unit: ComprehensionUnit) => {
      writes.push(unit);
      return Ok(undefined);
    },
  };
}

const noopExtract: (module: string) => ExtractStatic = () => async () => ({
  interfaceContract: 'export foo',
  dependencySlice: '',
});

const SRC: ComprehensionSourceFile[] = [{ path: 'a.ts', content: 'export const a = 1;\n' }];

afterEach(() => {
  delete process.env[REENTRANCY_ENV];
});

describe('mapWithConcurrency', () => {
  it('preserves input order and never exceeds the concurrency bound', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = [0, 1, 2, 3, 4];
    const out = await mapWithConcurrency(items, 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 2;
    });
    expect(out).toEqual([0, 2, 4, 6, 8]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('runComprehend — changed/all compile + write', () => {
  it('SC3: a --changed run recompiles exactly the changed-module set', async () => {
    const store = fakeStore();
    const reader = fakeReader({ 'pkg/a': SRC, 'pkg/b': SRC });
    const result = await runComprehend({
      mode: 'changed',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic: noopExtract,
      changedModules: ['pkg/a'],
      env: {},
    });
    expect(result.compiled).toEqual(['pkg/a']);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].provenance.module).toBe('pkg/a');
  });

  it('--all compiles every enumerated module', async () => {
    const store = fakeStore();
    const reader = fakeReader({ m1: SRC, m2: SRC });
    const result = await runComprehend({
      mode: 'all',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic: noopExtract,
      listModules: async () => ['m1', 'm2'],
      env: {},
    });
    expect(result.compiled).toEqual(['m1', 'm2']);
    expect(store.writes).toHaveLength(2);
  });

  it('SC4: with no generateSemantic, units are semantic: absent (no provider interaction)', async () => {
    const store = fakeStore();
    const reader = fakeReader({ 'pkg/a': SRC });
    const result = await runComprehend({
      mode: 'changed',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic: noopExtract,
      changedModules: ['pkg/a'],
      env: {},
    });
    expect(store.writes[0].provenance.semantic).toBe('absent');
    expect(result.semanticAbsent).toBe(1);
    expect(result.semanticPresent).toBe(0);
  });

  it('with a generateSemantic stub, the unit is semantic: present', async () => {
    const store = fakeStore();
    const reader = fakeReader({ 'pkg/a': SRC });
    const generateSemantic: GenerateSemantic = async () => ({
      summary: 'a summary',
      invariants: ['inv1'],
      model: 'stub-model',
    });
    const result = await runComprehend({
      mode: 'changed',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic: noopExtract,
      generateSemantic,
      changedModules: ['pkg/a'],
      env: {},
    });
    expect(store.writes[0].provenance.semantic).toBe('present');
    expect(result.semanticPresent).toBe(1);
  });

  it('refuses to run when already reentrant (no compile/write)', async () => {
    const store = fakeStore();
    const reader = fakeReader({ 'pkg/a': SRC });
    const result = await runComprehend({
      mode: 'changed',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic: noopExtract,
      changedModules: ['pkg/a'],
      env: { [REENTRANCY_ENV]: '1' },
    });
    expect(result.reentrancyRefused).toBe(true);
    expect(result.compiled).toEqual([]);
    expect(store.writes).toHaveLength(0);
  });

  it('sets the reentrancy flag DURING the run and restores it after', async () => {
    const env: NodeJS.ProcessEnv = {};
    const store = fakeStore();
    const reader = fakeReader({ 'pkg/a': SRC });
    let observedDuringRun = false;
    const generateSemantic: GenerateSemantic = async () => {
      observedDuringRun = isComprehensionReentrant(env);
      return { summary: 's', invariants: [] };
    };
    await runComprehend({
      mode: 'changed',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic: noopExtract,
      generateSemantic,
      changedModules: ['pkg/a'],
      env,
    });
    expect(observedDuringRun).toBe(true);
    expect(isComprehensionReentrant(env)).toBe(false); // restored
  });

  it('bounds concurrency across modules (peak in-flight <= concurrency)', async () => {
    const store = fakeStore();
    const modules = ['m1', 'm2', 'm3', 'm4', 'm5'];
    const reader = fakeReader(Object.fromEntries(modules.map((m) => [m, SRC])));
    let inFlight = 0;
    let peak = 0;
    const makeExtractStatic: (m: string) => ExtractStatic = () => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { interfaceContract: 'export foo', dependencySlice: '' };
    };
    await runComprehend({
      mode: 'all',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic,
      listModules: async () => modules,
      concurrency: 2,
      env: {},
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect(store.writes).toHaveLength(5);
  });

  it('skips a module whose source reader returns null (no throw)', async () => {
    const store = fakeStore();
    const reader = fakeReader({ 'pkg/a': SRC, 'pkg/gone': null });
    const result = await runComprehend({
      mode: 'changed',
      projectRoot: '/repo',
      reader,
      store,
      makeExtractStatic: noopExtract,
      changedModules: ['pkg/a', 'pkg/gone'],
      env: {},
    });
    expect(result.compiled).toEqual(['pkg/a']);
    expect(result.skipped).toContain('pkg/gone');
    expect(store.writes).toHaveLength(1);
  });
});
