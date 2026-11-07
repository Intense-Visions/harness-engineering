/**
 * Planted-positive regression tests for the dependency collectors (issue #2235).
 *
 * The sibling unit tests mock `buildDependencyGraph` / `validateDependencies`,
 * so they kept passing while the real collectors could never fire: the
 * circular-deps collector parsed every file with a stub parser (zero edges) and
 * only globbed `**\/*.ts`, and the layer/forbidden-import collectors validated
 * against `layers: []`. These tests run the real engines over tmp-dir fixtures:
 * each planted violation must be counted, and each clean twin must stay at 0 so
 * the assertions cannot pass by always reporting > 0.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CircularDepsCollector } from '../../../src/architecture/collectors/circular-deps';
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
import { CouplingCollector } from '../../../src/architecture/collectors/coupling';
import type { ArchConfig } from '../../../src/architecture/types';
import { TypeScriptParser } from '../../../src/shared/parsers/typescript';
import { Err } from '../../../src/shared/result';

const baseConfig: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
};

let root: string;

function plant(files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arch-planted-2235-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('CircularDepsCollector (real parser, issue #2235)', () => {
  const collector = new CircularDepsCollector();

  it('counts a planted two-file .ts import cycle', async () => {
    plant({
      'src/plant-a.ts': "import { b } from './plant-b';\nexport const a = () => b;\n",
      'src/plant-b.ts': "import { a } from './plant-a';\nexport const b = () => a;\n",
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.value).toBe(1);
    expect(result!.violations).toHaveLength(1);
    expect(result!.violations[0]!.detail).toContain('src/plant-a.ts');
    expect(result!.violations[0]!.detail).toContain('src/plant-b.ts');
  });

  it('counts a planted .mjs import cycle', async () => {
    plant({
      'lib/x.mjs': "import { y } from './y.mjs';\nexport const x = () => y;\n",
      'lib/y.mjs': "import { x } from './x.mjs';\nexport const y = () => x;\n",
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.value).toBe(1);
    expect(result!.violations[0]!.detail).toContain('lib/x.mjs');
    expect(result!.violations[0]!.detail).toContain('lib/y.mjs');
  });

  it('counts a planted .js import cycle', async () => {
    plant({
      'lib/p.js': "import { q } from './q.js';\nexport const p = () => q;\n",
      'lib/q.js': "import { p } from './p.js';\nexport const q = () => p;\n",
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.value).toBe(1);
    expect(result!.violations[0]!.detail).toContain('lib/p.js');
  });

  it('reports 0 for an acyclic fixture and still reports what it measured', async () => {
    plant({
      'src/plant-a.ts': "import { b } from './plant-b';\nexport const a = () => b;\n",
      'src/plant-b.ts': 'export const b = 1;\n',
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.value).toBe(0);
    expect(result!.violations).toHaveLength(0);
    // Denominator: a zero must come from a graph that was actually built.
    expect(result!.metadata).toMatchObject({ filesAnalyzed: 2, edgeCount: 1 });
  });
});

describe('LayerViolationCollector (configured layers, issue #2235)', () => {
  const collector = new LayerViolationCollector();
  const layered: ArchConfig = {
    ...baseConfig,
    layers: [
      { name: 'ui', pattern: 'src/ui/**', allowedDependencies: ['domain'] },
      { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
    ],
  };

  it('counts a planted wrong-direction import', async () => {
    plant({
      'src/ui/view.ts': "import { model } from '../domain/model';\nexport const view = model;\n",
      'src/domain/model.ts': "import { view } from '../ui/view';\nexport const model = 1;\n",
    });

    const [result] = await collector.collect(layered, root);

    expect(result!.value).toBe(1);
    expect(result!.violations[0]!.detail).toContain('domain -> ui');
    expect(result!.violations[0]!.file).toBe('src/domain/model.ts');
  });

  it('counts a planted wrong-direction .mjs -> .mjs import', async () => {
    const mjsLayers: ArchConfig = {
      ...baseConfig,
      layers: [
        { name: 'skills', pattern: 'skills/**', allowedDependencies: ['skills-lib'] },
        { name: 'skills-lib', pattern: 'skills-lib/**', allowedDependencies: [] },
      ],
    };
    plant({
      'skills/run.mjs': 'export const run = 1;\n',
      'skills-lib/util.mjs': "import { run } from '../skills/run.mjs';\nexport const u = run;\n",
    });

    const [result] = await collector.collect(mjsLayers, root);

    expect(result!.value).toBe(1);
    expect(result!.violations[0]!.detail).toContain('skills-lib -> skills');
  });

  it('reports 0 when every import follows the allowed direction', async () => {
    plant({
      'src/ui/view.ts': "import { model } from '../domain/model';\nexport const view = model;\n",
      'src/domain/model.ts': 'export const model = 1;\n',
    });

    const [result] = await collector.collect(layered, root);

    expect(result!.value).toBe(0);
    // Layer globs (`src/ui/**`) also match the directories themselves, exactly
    // as in check-deps, so the module count is a lower bound here.
    expect(result!.metadata).toMatchObject({ layersConfigured: 2 });
    expect(result!.metadata!.modulesAnalyzed as number).toBeGreaterThanOrEqual(2);
  });
});

describe('ForbiddenImportCollector (configured rules, issue #2235)', () => {
  const collector = new ForbiddenImportCollector();
  const ruled: ArchConfig = {
    ...baseConfig,
    forbiddenImports: [
      {
        from: 'src/domain/**',
        disallow: ['src/ui/**', 'node:child_process'],
        message: 'domain must stay pure',
      },
    ],
  };

  it('counts a planted forbidden relative import and a forbidden package import', async () => {
    plant({
      'src/ui/view.ts': 'export const view = 1;\n',
      'src/domain/model.ts':
        "import { view } from '../ui/view';\n" +
        "import { exec } from 'node:child_process';\n" +
        'export const model = [view, exec];\n',
    });

    const [result] = await collector.collect(ruled, root);

    expect(result!.value).toBe(2);
    const details = result!.violations.map((v) => v.detail).join('\n');
    expect(details).toContain('src/ui/view');
    expect(details).toContain('node:child_process');
    expect(result!.violations.every((v) => v.file === 'src/domain/model.ts')).toBe(true);
  });

  it('reports 0 when no file imports a disallowed target', async () => {
    plant({
      'src/ui/view.ts': "import { model } from '../domain/model';\nexport const view = model;\n",
      'src/domain/model.ts': "import { join } from 'node:path';\nexport const model = join;\n",
    });

    const [result] = await collector.collect(ruled, root);

    expect(result!.value).toBe(0);
    expect(result!.metadata).toMatchObject({ rulesConfigured: 1, filesAnalyzed: 1 });
  });

  it('reports 0 and an empty denominator when no rules are configured', async () => {
    plant({
      'src/domain/model.ts': "import { view } from '../ui/view';\nexport const m = view;\n",
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.value).toBe(0);
    expect(result!.metadata).toEqual({ rulesConfigured: 0, filesAnalyzed: 0 });
  });

  it('produces stable violation IDs across runs', async () => {
    plant({
      'src/ui/view.ts': 'export const view = 1;\n',
      'src/domain/model.ts': "import { view } from '../ui/view';\nexport const m = view;\n",
    });

    const [r1] = await collector.collect(ruled, root);
    const [r2] = await collector.collect(ruled, root);

    expect(r1!.violations[0]!.id).toMatch(/^[a-f0-9]{64}$/);
    expect(r1!.violations[0]!.id).toBe(r2!.violations[0]!.id);
  });
});

/**
 * The coupling collector's own unit test mocks `detectCouplingViolations`, and
 * that mock ignores the snapshot it is handed — so `findFiles` is never
 * observed and even the `filesAnalyzed` denominator is read back out of the
 * mock's own `stats`. Measured: replacing the collector's
 * `await findFiles('**\/*.ts', ...)` with `[]` makes it measure ZERO files and
 * the entire `packages/core` suite still passes. Coupling is the only one of
 * the five metric collectors whose denominator survives that mutation, and
 * `CouplingCollector` sits in `defaultCollectors` -> `runAll` -> `runArchCheck`
 * -> `harness ci check`, which `.husky/pre-commit` does not skip.
 *
 * WHY THE DENOMINATOR IS THE THING WORTH PINNING: `filesAnalyzed` is in
 * `WORK_DENOMINATORS` (`packages/cli/src/commands/check-arch.ts`) and `coupling`
 * is in no `CONFIG_GATED_CATEGORIES` entry, so this one number is the sole input
 * to `classifyMeasurement`'s measured-versus-abstained verdict for this
 * category. An untruthful denominator therefore corrupts the verdict itself, and
 * in the dangerous direction: a denominator reporting work it did not do reads
 * as `measured`. A ZERO one is safe today -- verified against unmutated source,
 * `classifyMeasurement({category:'coupling', value:0, metadata:{filesAnalyzed:0}})`
 * returns `'abstained'` with reason `nothing to measure (filesAnalyzed=0)`.
 * (An earlier version of this comment said a collapse to 0 "reads as an
 * IMPROVEMENT against the baseline". That was true before #2238 shipped the
 * abstention channel this morning -- see #2268 -- and is false against this tree.
 * The baselined `value` for this category is already 0 regardless, so there was
 * never an improvement to read.)
 *
 * These two cases run the REAL `detectCouplingViolations` over a tmp-dir
 * fixture and assert the denominator against the planted file count, so a 0 can
 * only come from a glob that actually ran. The pair is deliberately asymmetric
 * (3 files vs 2 after an exclude) so neither can pass on a constant.
 *
 * UPDATE (#2284): a nonzero coupling VIOLATION is now asserted too, in the
 * sibling describe below. This comment previously recorded that it could not
 * be: `buildCouplingSnapshot` hardcoded `imports: []` for every file, so
 * `fanOut`, `fanIn` and `transitiveDepth` were all 0 and the real detector
 * could not emit a violation through this collector whatever the fixture
 * imported (verified against a planted 20-import hub: `value: 0`,
 * `filesAnalyzed: 21`). The collector now parses real imports, so the planted
 * hub is reachable and the positive discriminator the denominator pin was
 * standing in for exists.
 *
 * `importEdges` joins `filesAnalyzed` in the metadata: it is the denominator
 * every coupling metric is actually derived from, so a 0 there is the signal
 * that the snapshot went hollow again.
 */
describe('CouplingCollector (real detector, denominator)', () => {
  const collector = new CouplingCollector();

  it('counts the .ts files it globbed, not a number handed back by a mock', async () => {
    plant({
      'src/a.ts': "import { b } from './b';\nexport const a = () => b;\n",
      'src/b.ts': 'export const b = 1;\n',
      'src/nested/c.ts': 'export const c = 2;\n',
      // Outside `**/*.ts`: proves the count tracks the glob, not the tree.
      'src/ignored.js': 'module.exports = 1;\n',
    });

    const [result] = await collector.collect(baseConfig, root);

    // `src/a.ts` carries the fixture's single import edge.
    expect(result!.metadata).toEqual({ filesAnalyzed: 3, importEdges: 1 });
  });

  it('drops excluded files from the denominator', async () => {
    // Positive control for the case above: same tree, one exclude, and the
    // denominator must move. Pins `resolveExcludePatterns(config)` being passed
    // through to `findFiles` as well as the call itself.
    plant({
      'src/a.ts': 'export const a = 1;\n',
      'src/b.ts': 'export const b = 2;\n',
      'src/generated/huge.ts': 'export const huge = 3;\n',
    });

    const [result] = await collector.collect(
      { ...baseConfig, excludePatterns: ['src/generated/**'] },
      root
    );

    // Neither file has import syntax, so the zero is corroborated as clean.
    expect(result!.metadata).toEqual({ filesAnalyzed: 2, importEdges: 0, importStatements: 0 });
  });
});

/**
 * Planted-positive tests for `CouplingCollector` (issue #2284).
 *
 * `buildCouplingSnapshot` used to hand the real detector a structurally empty
 * snapshot — `imports: []`, `exports: []`, an empty `dependencyGraph` — past the
 * type checker via `as unknown as CodebaseSnapshot`. Every metric the detector
 * derives was therefore 0 and every `value <= threshold` check passed, so the
 * collector could not emit a violation under ANY input. The gate stayed green
 * with an honest `filesAnalyzed`, which is why #2238's abstention channel read
 * it as `measured` rather than as a collector that never looked.
 *
 * These cases are a POSITIVE discriminator: a named metric on a named file, not
 * an absence. They fail if the snapshot goes hollow again (no imports -> no
 * violation), and the clean twin fails if the collector ever starts reporting
 * violations unconditionally. The twin also asserts `importEdges > 0`, so its
 * zero cannot come from a parse that produced nothing.
 */
describe('CouplingCollector (planted positives, issue #2284)', () => {
  const collector = new CouplingCollector();

  function plantHub(importCount: number): void {
    const names = Array.from({ length: importCount }, (_, i) => `leaf${i}`);
    const tree: Record<string, string> = {};
    for (const [i, n] of names.entries()) tree[`src/${n}.ts`] = `export const ${n} = ${i};\n`;
    tree['src/hub.ts'] =
      names.map((n) => `import { ${n} } from './${n}';`).join('\n') +
      `\nexport const all = [${names.join(', ')}];\n`;
    plant(tree);
  }

  it('flags a planted 20-import hub by file and metric (fanOut warn threshold is 15)', async () => {
    plantHub(20);

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.value).toBeGreaterThan(0);
    const fanOut = result!.violations.filter((v) => v.detail.startsWith('fanOut='));
    expect(fanOut).toHaveLength(1);
    expect(fanOut[0]!.file).toBe('src/hub.ts');
    expect(fanOut[0]!.detail).toBe('fanOut=20 (threshold: 15)');
    expect(fanOut[0]!.severity).toBe('warning');
    expect(fanOut[0]!.id).toMatch(/^[a-f0-9]{64}$/);
    // Denominator: the hub's 20 edges were really parsed, not assumed.
    expect(result!.metadata).toMatchObject({ filesAnalyzed: 21, importEdges: 20 });
  });

  it('reports 0 for a clean twin while still proving it parsed import edges', async () => {
    // Same shape, under every threshold: 3 imports is below the fanOut warn of
    // 15, and 4 total connections is below the couplingRatio check's floor of 5.
    plant({
      'src/leaf-a.ts': 'export const a = 1;\n',
      'src/leaf-b.ts': 'export const b = 2;\n',
      'src/leaf-c.ts': 'export const c = 3;\n',
      'src/small-hub.ts':
        "import { a } from './leaf-a';\nimport { b } from './leaf-b';\n" +
        "import { c } from './leaf-c';\nexport const all = [a, b, c];\n",
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.value).toBe(0);
    expect(result!.violations).toHaveLength(0);
    expect(result!.metadata).toMatchObject({ filesAnalyzed: 4, importEdges: 3 });
  });

  it('keeps a planted hub out of the measurement when it is excluded', async () => {
    // Asymmetric positive control for the pair above: the same 20-import hub,
    // excluded, must stop producing its violation AND drop out of both
    // denominators — so neither assertion can pass on a constant.
    plantHub(20);

    const [result] = await collector.collect(
      { ...baseConfig, excludePatterns: ['src/hub.ts'] },
      root
    );

    expect(result!.violations.filter((v) => v.detail.startsWith('fanOut='))).toHaveLength(0);
    expect(result!.metadata).toMatchObject({ filesAnalyzed: 20, importEdges: 0 });
  });

  it('never classifies a test file, however many helpers it imports', async () => {
    // `*.test.ts` / `*.spec.ts` are excluded by the collector: a test
    // legitimately imports a dozen helpers plus its subject, so counting that
    // as fan-out measures the test convention rather than the production graph.
    const names = Array.from({ length: 20 }, (_, i) => `helper${i}`);
    const tree: Record<string, string> = {};
    for (const [i, n] of names.entries()) tree[`src/${n}.ts`] = `export const ${n} = ${i};\n`;
    tree['src/wide.test.ts'] =
      names.map((n) => `import { ${n} } from './${n}';`).join('\n') +
      `\nexport const all = [${names.join(', ')}];\n`;
    plant(tree);

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.violations).toHaveLength(0);
    expect(result!.metadata).toMatchObject({ filesAnalyzed: 20, importEdges: 0 });
  });
});

/**
 * `importEdges: 0` is ambiguous on its own (#2304). A package with no import
 * syntax — declaration-only, a re-export barrel, a types-only module — really
 * has zero edges, while a parse that came back hollow (#2284) reports the same
 * zero. `importStatements`, counted from the file text, is what tells them
 * apart, and the CLI abstains only when it is non-zero.
 */
describe('CouplingCollector (importEdges corroboration, issue #2304)', () => {
  const collector = new CouplingCollector();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports importStatements: 0 for a declaration-only package', async () => {
    plant({
      'src/index.d.ts': 'export interface A { x: number }\nexport type B = A[];\n',
      'src/barrel.d.ts': "export * from './index';\nexport type { A } from './index';\n",
      'src/types.ts': 'export type C = { y: string };\n// import x from "commented-out"\n',
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.metadata).toEqual({ filesAnalyzed: 3, importEdges: 0, importStatements: 0 });
  });

  it('reports the import syntax it found when the parse returns no edges', async () => {
    // Simulate the hollow parse: `parseSourceFiles` substitutes `[]` when
    // `extractImports` fails, which is exactly a snapshot with no edges over
    // files that plainly import.
    vi.spyOn(TypeScriptParser.prototype, 'extractImports').mockReturnValue(
      Err({ code: 'PARSE_ERROR', message: 'hollow', details: {}, suggestions: [] } as never)
    );
    plant({
      'src/a.ts': "import { b } from './b';\nimport type { T } from './t';\nexport const a = b;\n",
      'src/b.ts':
        "import {\n  readFileSync,\n} from 'node:fs';\nexport const b = () => import('./a');\n",
      'src/t.ts': 'export type T = number;\n',
    });

    const [result] = await collector.collect(baseConfig, root);

    // 3 static declarations (one multi-line) + 1 dynamic import.
    expect(result!.metadata).toEqual({ filesAnalyzed: 3, importEdges: 0, importStatements: 4 });
  });

  it('omits importStatements when the parse found edges', async () => {
    // Positive control for the two cases above: the corroborating count is only
    // computed when it is needed, so a populated snapshot never carries it.
    plant({
      'src/a.ts': "import { b } from './b';\nexport const a = b;\n",
      'src/b.ts': 'export const b = 1;\n',
    });

    const [result] = await collector.collect(baseConfig, root);

    expect(result!.metadata).toEqual({ filesAnalyzed: 2, importEdges: 1 });
  });
});
