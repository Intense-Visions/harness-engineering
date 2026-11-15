// Behavior lock for scripts/lib/core-public-symbols.mjs (#2473 §3).
//
// The old `generate:barrels:check` only diffed barrel FILE text, so a new symbol
// published behind an `export *` chain (the clumping `buildClump` case) still
// reported "up to date". These tests pin that the symbol resolver SEES through
// `export *`, and that the manifest diff reports both directions of drift.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computePublicSymbols,
  diffSymbols,
  parseManifest,
  renderManifest,
} from '../../scripts/lib/core-public-symbols.mjs';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'core-public-symbols-'));
  mkdirSync(join(dir, 'fleet', 'clumping'), { recursive: true });
  mkdirSync(join(dir, 'types-pkg'), { recursive: true });
  writeFileSync(
    join(dir, 'index.ts'),
    "export * from './fleet';\nexport * from '@fixture/types';\nexport { VERSION } from './version';\n"
  );
  writeFileSync(join(dir, 'version.ts'), "export const VERSION = '0';\n");
  writeFileSync(join(dir, 'fleet', 'index.ts'), "export * from './clumping';\n");
  writeFileSync(
    join(dir, 'fleet', 'clumping', 'form.ts'),
    'export function formClumps() {}\nexport function buildClump() {}\nexport type Grade = 1;\n'
  );
  writeFileSync(
    join(dir, 'fleet', 'clumping', 'index.ts'),
    "export { formClumps } from './form';\nexport type { Grade } from './form';\n"
  );
  writeFileSync(join(dir, 'types-pkg', 'index.ts'), 'export type Result = 1;\n');
  return dir;
}

function symbolsOf(dir) {
  return computePublicSymbols({
    entry: join(dir, 'index.ts'),
    baseUrl: dir,
    paths: { '@fixture/types': ['types-pkg/index.ts'] },
  });
}

test('resolves names through nested export * chains and mapped workspace packages', () => {
  const dir = fixture();
  try {
    assert.deepEqual(symbolsOf(dir), ['Grade', 'Result', 'VERSION', 'formClumps']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a symbol added behind export * changes the resolved set while the barrel text does not', () => {
  const dir = fixture();
  try {
    const committed = parseManifest(renderManifest(symbolsOf(dir)));
    // The exact #2473 reproduction: index.ts (the "barrel") is untouched.
    appendFileSync(
      join(dir, 'fleet', 'clumping', 'index.ts'),
      "export { buildClump } from './form';\n"
    );
    assert.deepEqual(diffSymbols(committed, symbolsOf(dir)), {
      added: ['buildClump'],
      removed: [],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reports removed names, and an unchanged surface diffs clean (positive/negative pair)', () => {
  assert.deepEqual(diffSymbols(['a', 'b', 'c'], ['a', 'c']), { added: [], removed: ['b'] });
  assert.deepEqual(diffSymbols(['a', 'b'], ['b', 'a']), { added: [], removed: [] });
});

test('manifest round-trips and ignores header/blank lines', () => {
  const text = renderManifest(['Zed', 'alpha']);
  assert.match(text, /^# AUTO-GENERATED/);
  assert.deepEqual(parseManifest(text), ['Zed', 'alpha']);
  assert.deepEqual(parseManifest('# c\r\n\r\nx\r\n'), ['x']);
});
