import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectDeadCode } from '../../../src/entropy/detectors/dead-code';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { relativePosix } from '../../../src/shared/fs-utils';

// Issue #2075: three independent engines that manufactured false `dead`
// verdicts. Each `describe` isolates one engine with a fixture in which a
// plain, correctly-credited control sits beside the case under test, so a
// pass cannot come from the detector simply reporting nothing.
//
//   D1 — `bin` is a default walker skip-dir, so a declared entry point under
//        `src/bin/` (and its sibling modules) never entered the snapshot.
//   D2 — an extensionless import of a dotted basename (`./budget.types`) was
//        read as having the extension `.types` and never resolved.
//   D3 — default imports, aliased named imports, `export { default } from`
//        and dynamic `import()` credited nothing in the usage map.

const parser = new TypeScriptParser();
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dead-code-2075-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel: string, contents: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

async function analyze(entryPoints: string[], exclude?: string[]) {
  const snapshot = await buildSnapshot({
    rootDir: root,
    parser,
    analyze: { deadCode: true },
    include: ['src/**/*.ts', 'tools/**/*.ts', 'tests/**/*.ts'],
    entryPoints,
    ...(exclude ? { exclude } : {}),
  });
  expect(snapshot.ok).toBe(true);
  if (!snapshot.ok) throw new Error('snapshot failed');
  const result = await detectDeadCode(snapshot.value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('detect failed');
  const rel = (p: string) => relativePosix(root, p);
  return {
    files: snapshot.value.files.map((f) => rel(f.path)).sort(),
    deadFiles: result.value.deadFiles.map((f) => rel(f.path)).sort(),
    deadExports: result.value.deadExports.map((e) => `${rel(e.file)}:${e.name}`).sort(),
  };
}

describe('D1 — a declared entry point under a default skip-dir (issue #2075)', () => {
  beforeEach(() => {
    write(
      'src/bin/cli.ts',
      "import { helper } from './helper';\nimport { used } from '../lib';\nhelper(used);\n"
    );
    write('src/bin/helper.ts', 'export function helper(x: number): number { return x; }\n');
    write('src/lib.ts', 'export const used = 1;\nexport const unusedControl = 2;\n');
    // A `bin/` directory that holds no declared entry point stays skipped.
    write('tools/bin/stray.ts', 'export const stray = 1;\n');
  });

  it('scans the entry point and its sibling modules with the default excludes', async () => {
    const r = await analyze(['src/bin/cli.ts']);
    expect(r.files).toContain('src/bin/cli.ts');
    expect(r.files).toContain('src/bin/helper.ts');
    expect(r.deadExports).not.toContain('src/lib.ts:used');
    expect(r.deadExports).not.toContain('src/bin/helper.ts:helper');
    // Control: the walker still skips a bin/ dir no entry point lives in.
    expect(r.files).not.toContain('tools/bin/stray.ts');
    // Control: an export nothing imports is still reported.
    expect(r.deadExports).toContain('src/lib.ts:unusedControl');
  });

  it('re-admits the entry directory past a configured `**/bin/**` exclude too', async () => {
    const r = await analyze(['src/bin/cli.ts'], ['**/node_modules/**', '**/bin/**']);
    expect(r.files).toContain('src/bin/cli.ts');
    expect(r.files).toContain('src/bin/helper.ts');
    expect(r.deadExports).not.toContain('src/lib.ts:used');
    expect(r.files).not.toContain('tools/bin/stray.ts');
    expect(r.deadExports).toContain('src/lib.ts:unusedControl');
  });

  it('harvests test imports from a bin/ test directory mirroring the entry directory', async () => {
    write('src/bin/testonly.ts', 'export const testOnly = 1;\nexport const deadControl = 2;\n');
    write(
      'src/bin/cli.ts',
      "import { helper } from './helper';\nimport { used } from '../lib';\nimport './testonly';\nhelper(used);\n"
    );
    write(
      'tests/bin/testonly.test.ts',
      "import { testOnly } from '../../src/bin/testonly';\ntestOnly;\n"
    );
    const r = await analyze(
      ['src/bin/cli.ts'],
      ['**/node_modules/**', '**/bin/**', '**/*.test.ts']
    );
    expect(r.deadExports).not.toContain('src/bin/testonly.ts:testOnly');
    expect(r.deadExports).toContain('src/bin/testonly.ts:deadControl');
  });

  it('keeps other excludes in force inside the entry directory', async () => {
    write('src/bin/cli.test.ts', "import { helper } from './helper';\nhelper(1);\n");
    const r = await analyze(['src/bin/cli.ts'], ['**/bin/**', '**/*.test.ts']);
    expect(r.files).not.toContain('src/bin/cli.test.ts');
  });
});

describe('D2 — extensionless import of a dotted basename (issue #2075)', () => {
  it('resolves ./budget.types to budget.types.ts and ./app.config to app.config.ts', async () => {
    write(
      'src/main.ts',
      [
        "import type { Budget } from './budget.types';",
        "import { appConfig } from './app.config';",
        "import { plain } from './plain';",
        'export const run = (b: Budget) => [b, appConfig, plain];',
        '',
      ].join('\n')
    );
    write('src/budget.types.ts', 'export type Budget = { cap: number };\n');
    write('src/app.config.ts', 'export const appConfig = {};\n');
    write('src/plain.ts', 'export const plain = 1;\n');
    write('src/orphan.types.ts', 'export type Orphan = number;\n');

    const r = await analyze(['src/main.ts']);
    expect(r.deadFiles).not.toContain('src/budget.types.ts');
    expect(r.deadFiles).not.toContain('src/app.config.ts');
    expect(r.deadExports).not.toContain('src/budget.types.ts:Budget');
    expect(r.deadExports).not.toContain('src/app.config.ts:appConfig');
    // Controls: the plain import resolves, and a dotted file nothing imports is dead.
    expect(r.deadFiles).not.toContain('src/plain.ts');
    expect(r.deadFiles).toContain('src/orphan.types.ts');
  });

  it('still prefers a real on-disk file whose name carries the dotted segment', async () => {
    write('src/main.ts', "import { x } from './data.json.ts';\nexport const y = x;\n");
    write('src/data.json.ts', 'export const x = 1;\n');
    const r = await analyze(['src/main.ts']);
    expect(r.deadFiles).not.toContain('src/data.json.ts');
  });
});

describe('D3 — default exports and aliased imports in the usage map (issue #2075)', () => {
  beforeEach(() => {
    write(
      'src/thing.ts',
      [
        'export default function thing(): number { return 1; }',
        'export const named = 1;',
        'export const aliased = 2;',
        'export const neverImported = 3;',
        '',
      ].join('\n')
    );
  });

  it('credits a default import and an aliased named import', async () => {
    write(
      'src/main.ts',
      [
        "import thing from './thing';",
        "import { named, aliased as renamed } from './thing';",
        'export const out = [thing(), named, renamed];',
        '',
      ].join('\n')
    );
    const r = await analyze(['src/main.ts']);
    expect(r.deadExports).not.toContain('src/thing.ts:default');
    expect(r.deadExports).not.toContain('src/thing.ts:aliased');
    // Controls: the plain named import is credited, an unimported export is not.
    expect(r.deadExports).not.toContain('src/thing.ts:named');
    expect(r.deadExports).toContain('src/thing.ts:neverImported');
  });

  it('credits the default through `export { default } from` and `export { default as X } from`', async () => {
    write('src/other.ts', 'export default class Other {}\nexport const otherNamed = 1;\n');
    write(
      'src/barrel.ts',
      "export { default } from './thing';\nexport { default as Other } from './other';\n"
    );
    write(
      'src/main.ts',
      [
        "import thing, { Other } from './barrel';",
        "import { named, aliased, neverImported } from './thing';",
        'export const out = [thing, Other, named, aliased, neverImported];',
        '',
      ].join('\n')
    );
    const r = await analyze(['src/main.ts']);
    expect(r.deadExports).not.toContain('src/thing.ts:default');
    expect(r.deadExports).not.toContain('src/other.ts:default');
    // Control: an export of other.ts nothing imports is still reported.
    expect(r.deadExports).toContain('src/other.ts:otherNamed');
  });

  it('credits the default export of a dynamically imported module', async () => {
    write(
      'src/main.ts',
      [
        "import { named, aliased, neverImported } from './thing';",
        'export async function load() {',
        "  const mod = await import('./thing');",
        '  return [mod.default, named, aliased, neverImported];',
        '}',
        '',
      ].join('\n')
    );
    const r = await analyze(['src/main.ts']);
    expect(r.deadExports).not.toContain('src/thing.ts:default');
  });
});
