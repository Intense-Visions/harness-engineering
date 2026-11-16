/**
 * One parse per file per `runAll` across the dependency collectors (#2270).
 *
 * circular-deps, layer-violations and forbidden-imports each walk an
 * overlapping set of source files. Before #2270 each one parsed every file it
 * walked, so a file covered by all three was parsed three times in one
 * `check-arch` run. `runAll` now hands every collector one run-scoped context
 * whose parser memoizes each file's imports, and these tests pin both halves of
 * that contract: the parse count drops to one, and no collector's output moves.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAll } from '../../../src/architecture/collectors/index';
import { CircularDepsCollector } from '../../../src/architecture/collectors/circular-deps';
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports';
import type { ArchConfig, Collector } from '../../../src/architecture/types';
import { TypeScriptParser } from '../../../src/shared/parsers/typescript';
import { resetDefaultRegistry } from '../../../src/shared/parsers/registry';

let root: string;

function plant(files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
}

/**
 * A tree every dependency collector has something to say about: a cycle, a
 * layer violation, a forbidden import, a file with a syntax error (skipped, not
 * fatal) and a `.mjs` file (the `javascript` registry entry, not `typescript`).
 */
function plantMixedTree(): void {
  plant({
    'src/api/handler.ts': "import { q } from '../db/query';\nexport const h = () => q;\n",
    'src/db/query.ts': "import { h } from '../api/handler';\nexport const q = () => h;\n",
    'src/db/pool.ts': "import fs from 'node:fs';\nexport const p = fs;\n",
    'src/util/broken.ts': 'export const = ;\n',
    'src/util/side.mjs': "import { p } from '../db/pool.ts';\nexport const s = p;\n",
  });
}

const config: ArchConfig = {
  enabled: true,
  baselinePath: '.harness/arch/baselines.json',
  thresholds: {},
  modules: {},
  excludePatterns: [],
  layers: [
    { name: 'api', pattern: 'src/api/**', allowedDependencies: [] },
    { name: 'db', pattern: 'src/db/**', allowedDependencies: [] },
    { name: 'util', pattern: 'src/util/**', allowedDependencies: ['db'] },
  ],
  forbiddenImports: [{ from: 'src/db/**', disallow: ['node:fs'] }],
};

const dependencyCollectors = (): Collector[] => [
  new CircularDepsCollector(),
  new LayerViolationCollector(),
  new ForbiddenImportCollector(),
];

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arch-shared-parse-2270-')));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetDefaultRegistry();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runAll shares one parse per file across the dependency collectors (#2270)', () => {
  it('parses each file at most once in a run, though three collectors read it', async () => {
    plantMixedTree();
    const parse = vi.spyOn(TypeScriptParser.prototype, 'parseFile');
    // The `javascript` registry entry binds `parseFile` when the registry is
    // built, so build it after the spy is installed.
    resetDefaultRegistry();

    await runAll(config, root, dependencyCollectors());

    const perFile = new Map<string, number>();
    for (const [file] of parse.mock.calls) perFile.set(file, (perFile.get(file) ?? 0) + 1);
    const handler = path.join(root, 'src/api/handler.ts');
    const pool = path.join(root, 'src/db/pool.ts');
    // All three collectors read these: circular-deps (every JS/TS file),
    // layer-violations (every layer file), forbidden-imports (`src/db/**`).
    expect(perFile.get(pool)).toBe(1);
    expect(perFile.get(handler)).toBe(1);
    expect(Math.max(...perFile.values())).toBe(1);
  });

  it('reports exactly what each collector reports when run on its own', async () => {
    plantMixedTree();

    const shared = await runAll(config, root, dependencyCollectors());
    const standalone: unknown[] = [];
    for (const c of dependencyCollectors()) standalone.push(...(await c.collect(config, root)));

    expect(shared).toEqual(standalone);
    // Not a vacuous match of two empty runs: each collector found its planted
    // positive.
    const value = (cat: string) => shared.find((r) => r.category === cat)!.value;
    expect(value('circular-deps')).toBe(1);
    expect(value('layer-violations')).toBeGreaterThan(0);
    expect(value('forbidden-imports')).toBe(1);
  });

  it('does not share parses between two runs', async () => {
    plantMixedTree();
    await runAll(config, root, dependencyCollectors());
    const parse = vi.spyOn(TypeScriptParser.prototype, 'parseFile');
    resetDefaultRegistry();

    await runAll(config, root, dependencyCollectors());

    // A run-scoped cache: the second run re-reads the tree from disk.
    expect(parse.mock.calls.map(([f]) => f)).toContain(path.join(root, 'src/db/pool.ts'));
  });
});
