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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CircularDepsCollector } from '../../../src/architecture/collectors/circular-deps';
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
import { CouplingCollector } from '../../../src/architecture/collectors/coupling';
import type { ArchConfig } from '../../../src/architecture/types';

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
 * -> `harness ci check`, which `.husky/pre-commit` does not skip. A metric
 * silently collapsing to 0 reads as an IMPROVEMENT against the baseline.
 *
 * These two cases run the REAL `detectCouplingViolations` over a tmp-dir
 * fixture and assert the denominator against the planted file count, so a 0 can
 * only come from a glob that actually ran. The pair is deliberately asymmetric
 * (3 files vs 2 after an exclude) so neither can pass on a constant.
 *
 * NOT asserted here: a nonzero coupling VIOLATION. `buildCouplingSnapshot` in
 * the collector hardcodes `imports: []` for every file, so `fanOut` is always
 * 0, `fanIn` always 0 and `transitiveDepth` always 0 — the real detector can
 * never emit a violation through this collector whatever the fixture imports
 * (verified against a planted 20-import hub: `value: 0`, `filesAnalyzed: 21`).
 * Pinning the denominator is therefore the whole of what is pinnable without
 * changing production code.
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

    expect(result!.metadata).toEqual({ filesAnalyzed: 3 });
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

    expect(result!.metadata).toEqual({ filesAnalyzed: 2 });
  });
});
