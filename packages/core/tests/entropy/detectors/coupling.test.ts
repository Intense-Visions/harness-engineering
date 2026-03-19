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
});
