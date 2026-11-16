import { describe, it, expect } from 'vitest';
import { detectCouplingViolations } from '../../../src/entropy/detectors/coupling';
import type { CodebaseSnapshot, CouplingConfig } from '../../../src/entropy/types';
import type { GraphCouplingData } from '../../../src/entropy/detectors/coupling';

function makeImport(source: string) {
  return {
    source,
    specifiers: ['default'],
    default: 'mod',
    location: { file: '', line: 1, column: 0 },
    kind: 'value' as const,
  };
}

function makeSnapshot(
  files: Array<{ path: string; imports?: Array<ReturnType<typeof makeImport>> }>
): CodebaseSnapshot {
  return {
    files: files.map((f) => ({
      path: f.path,
      ast: { type: 'module', body: [] },
      imports: f.imports ?? [],
      exports: [],
      internalSymbols: [],
      jsDocComments: [],
    })),
    dependencyGraph: { nodes: [], edges: [] },
    exportMap: { byFile: new Map(), byName: new Map() },
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir: '/project',
    config: {
      rootDir: '/project',
      analyze: {},
    },
    buildTime: 0,
  } as unknown as CodebaseSnapshot;
}

describe('detectCouplingViolations', () => {
  it('returns empty report for well-coupled files', async () => {
    const snapshot = makeSnapshot([
      { path: 'src/a.ts', imports: [makeImport('./b')] },
      { path: 'src/b.ts', imports: [] },
    ]);

    const result = await detectCouplingViolations(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.violations).toHaveLength(0);
    expect(result.value.stats.filesAnalyzed).toBe(2);
  });

  it('detects high fan-out (>15 imports)', async () => {
    const manyImports = Array.from({ length: 16 }, (_, i) => makeImport(`./module${i}`));
    const snapshot = makeSnapshot([
      { path: 'src/hub.ts', imports: manyImports },
      ...Array.from({ length: 16 }, (_, i) => ({
        path: `src/module${i}.ts`,
        imports: [] as Array<ReturnType<typeof makeImport>>,
      })),
    ]);

    const result = await detectCouplingViolations(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fanOutViolations = result.value.violations.filter((v) => v.metric === 'fanOut');
    expect(fanOutViolations.length).toBeGreaterThanOrEqual(1);
    expect(fanOutViolations[0].file).toBe('src/hub.ts');
    expect(fanOutViolations[0].severity).toBe('warning');
    expect(fanOutViolations[0].tier).toBe(2);
    expect(fanOutViolations[0].value).toBe(16);
  });

  it('detects high fan-in (>20 importers)', async () => {
    const importers = Array.from({ length: 21 }, (_, i) => ({
      path: `src/consumer${i}.ts`,
      imports: [makeImport('./shared.ts')],
    }));
    const snapshot = makeSnapshot([{ path: 'src/shared.ts', imports: [] }, ...importers]);

    const result = await detectCouplingViolations(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fanInViolations = result.value.violations.filter((v) => v.metric === 'fanIn');
    expect(fanInViolations.length).toBeGreaterThanOrEqual(1);
    expect(fanInViolations[0].file).toBe('src/shared.ts');
    expect(fanInViolations[0].severity).toBe('info');
    expect(fanInViolations[0].tier).toBe(3);
    expect(fanInViolations[0].value).toBe(21);
  });

  it('accepts graph coupling data directly', async () => {
    const snapshot = makeSnapshot([{ path: 'src/a.ts' }]);
    const graphData: GraphCouplingData = {
      files: [
        {
          file: 'src/a.ts',
          fanIn: 5,
          fanOut: 20,
          couplingRatio: 0.8,
          transitiveDepth: 35,
        },
      ],
    };

    const result = await detectCouplingViolations(snapshot, undefined, graphData);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should have fan-out warning (20 > 15)
    const fanOutV = result.value.violations.filter((v) => v.metric === 'fanOut');
    expect(fanOutV).toHaveLength(1);
    expect(fanOutV[0].value).toBe(20);

    // Should have coupling ratio warning (0.8 > 0.7)
    const ratioV = result.value.violations.filter((v) => v.metric === 'couplingRatio');
    expect(ratioV).toHaveLength(1);
    expect(ratioV[0].value).toBe(0.8);

    // Should have transitive depth info (35 > 30)
    const depthV = result.value.violations.filter((v) => v.metric === 'transitiveDependencyDepth');
    expect(depthV).toHaveLength(1);
    expect(depthV[0].value).toBe(35);
    expect(depthV[0].tier).toBe(3);
  });

  it('uses default thresholds when config is empty', async () => {
    const manyImports = Array.from({ length: 16 }, (_, i) => makeImport(`./m${i}`));
    const snapshot = makeSnapshot([{ path: 'src/big.ts', imports: manyImports }]);

    const emptyConfig: CouplingConfig = {};
    const result = await detectCouplingViolations(snapshot, emptyConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Default fan-out threshold is 15, so 16 imports should trigger
    const fanOutV = result.value.violations.filter((v) => v.metric === 'fanOut');
    expect(fanOutV).toHaveLength(1);
    expect(fanOutV[0].threshold).toBe(15);
  });
  // #2153: under TS `"module": "NodeNext"` the `.js` / `.mjs` / `.cjs` extension
  // is mandatory on a relative specifier, and it names the `.ts` / `.mts` /
  // `.cts` (or `.tsx`) SOURCE. Resolving it literally left every ESM file at
  // fanIn 0, pinning couplingRatio to 1.00. Each case asserts the NAMED target's
  // fanIn via the fanIn rule (threshold 0), so an abstention cannot satisfy it.
  describe('TS ESM runtime-extension specifiers (#2153)', () => {
    const fanInOf = async (
      files: Array<{ path: string; imports?: Array<ReturnType<typeof makeImport>> }>
    ): Promise<Map<string, number>> => {
      const result = await detectCouplingViolations(makeSnapshot(files), {
        thresholds: { fanIn: { info: 0 } },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return new Map();
      return new Map(
        result.value.violations.filter((v) => v.metric === 'fanIn').map((v) => [v.file, v.value])
      );
    };

    it('resolves ./b.js to b.ts', async () => {
      const fanIn = await fanInOf([
        { path: 'src/a.ts', imports: [makeImport('./b.js')] },
        { path: 'src/b.ts' },
      ]);
      expect(fanIn.get('src/b.ts')).toBe(1);
    });

    it('resolves ./c.mjs to c.mts and ./d.cjs to d.cts', async () => {
      const fanIn = await fanInOf([
        { path: 'src/a.ts', imports: [makeImport('./c.mjs'), makeImport('./d.cjs')] },
        { path: 'src/c.mts' },
        { path: 'src/d.cts' },
      ]);
      expect(fanIn.get('src/c.mts')).toBe(1);
      expect(fanIn.get('src/d.cts')).toBe(1);
    });

    it('resolves ./View.js to View.tsx', async () => {
      const fanIn = await fanInOf([
        { path: 'src/a.ts', imports: [makeImport('./View.js')] },
        { path: 'src/View.tsx' },
      ]);
      expect(fanIn.get('src/View.tsx')).toBe(1);
    });

    it('resolves ./lib/index.js and ../lib/index.js to lib/index.ts', async () => {
      const fanIn = await fanInOf([
        { path: 'src/a.ts', imports: [makeImport('./lib/index.js')] },
        { path: 'src/sub/b.ts', imports: [makeImport('../lib/index.js')] },
        { path: 'src/lib/index.ts' },
      ]);
      expect(fanIn.get('src/lib/index.ts')).toBe(2);
    });

    it('still resolves a literal .js file in a plain-JS project', async () => {
      const fanIn = await fanInOf([
        { path: 'src/a.js', imports: [makeImport('./b.js')] },
        { path: 'src/b.js' },
      ]);
      expect(fanIn.get('src/b.js')).toBe(1);
    });

    it('a heavily-imported ESM hub no longer reports couplingRatio 1.00', async () => {
      // The issue's A/B: 10 outbound imports, 3 importers via `.js` specifiers.
      // Expected ratio 10 / (3 + 10) = 0.77, the same as the extensionless form.
      const deps = Array.from({ length: 10 }, (_, i) => `src/dep${i}.ts`);
      const snapshot = makeSnapshot([
        {
          path: 'src/auth-helper.ts',
          imports: deps.map((_, i) => makeImport(`./dep${i}.js`)),
        },
        ...deps.map((path) => ({ path })),
        ...[0, 1, 2].map((i) => ({
          path: `src/spec${i}.ts`,
          imports: [makeImport('./auth-helper.js')],
        })),
      ]);
      const result = await detectCouplingViolations(snapshot);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const ratio = result.value.violations.find(
        (v) => v.metric === 'couplingRatio' && v.file === 'src/auth-helper.ts'
      );
      expect(ratio?.value).toBeCloseTo(10 / 13, 5);
    });
  });
});
