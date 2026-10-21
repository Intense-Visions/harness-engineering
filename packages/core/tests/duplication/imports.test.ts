import { describe, it, expect } from 'vitest';
import { parse } from '@typescript-eslint/typescript-estree';
import {
  moduleKey,
  collectFileImports,
  usedImportKeys,
  sharedImportKey,
} from '../../src/duplication/imports';
import { extractUnits } from '../../src/duplication/units';

function programOf(src: string) {
  return parse(src, {
    tokens: true,
    loc: true,
    range: true,
    jsx: false,
    errorOnUnknownASTType: false,
  });
}

/** `byKey` as a plain sorted record, so every assertion names VALUES. */
function keyed(src: string, relPath: string): Record<string, string[]> {
  const { byKey } = collectFileImports(programOf(src), relPath);
  return Object.fromEntries([...byKey].map(([key, names]) => [key, [...names]]));
}

describe('moduleKey', () => {
  it('resolves specifiers of DIFFERENT depth to ONE key', () => {
    // The whole point of resolution: these three raw strings are three
    // different strings naming one module. A raw-specifier implementation
    // treats them as three modules and never labels the class.
    expect(
      moduleKey('src/copy-craft/phases/critique.ts', '../../shared/craft/fenced-json.js')
    ).toBe('src/shared/craft/fenced-json');
    expect(moduleKey('src/beta.ts', './shared/payload.js')).toBe('src/shared/payload');
    expect(moduleKey('src/wrappers/alpha.ts', '../shared/payload.js')).toBe('src/shared/payload');
    expect(moduleKey('src/deep/nested/gamma.ts', '../../shared/payload.js')).toBe(
      'src/shared/payload'
    );
  });

  it('returns null for every bare specifier', () => {
    expect(moduleKey('src/a.ts', 'node:fs')).toBeNull();
    expect(moduleKey('src/a.ts', 'fs')).toBeNull();
    expect(moduleKey('src/a.ts', 'commander')).toBeNull();
    expect(moduleKey('src/a.ts', '@scope/pkg')).toBeNull();
    expect(moduleKey('src/a.ts', '@harness-engineering/core')).toBeNull();
  });

  it('returns null for a relative specifier that escapes rootDir', () => {
    expect(moduleKey('src/a.ts', '../../outside/thing.js')).toBeNull();
    expect(moduleKey('src/a.ts', '../..')).toBeNull();
  });

  it('strips every supported extension to one key, case-insensitively', () => {
    for (const spec of [
      './m.ts',
      './m.tsx',
      './m.js',
      './m.jsx',
      './m.mjs',
      './m.cjs',
      './m',
      './m.JS',
    ]) {
      expect(moduleKey('src/a.ts', spec)).toBe('src/m');
    }
  });

  it('normalizes a redundant path segment rather than keying on its spelling', () => {
    expect(moduleKey('src/a/b.ts', './x/../y.js')).toBe('src/a/y');
  });
});

describe('collectFileImports', () => {
  it('drops a type-only DECLARATION entirely', () => {
    expect(
      keyed(`import type { A } from './t.js';\nexport const a: A = 1 as never;\n`, 'src/f.ts')
    ).toEqual({});
  });

  it('drops an inline type SPECIFIER but keeps its value siblings', () => {
    // The per-specifier arm, not merely the per-declaration one: two of this
    // repository's classes stop being labelled on this line alone.
    expect(keyed(`import { type A, b } from './m.js';\nexport const x = b;\n`, 'src/f.ts')).toEqual(
      { 'src/m': ['b'] }
    );
  });

  it('drops a side-effect-only import, which introduces no binding', () => {
    expect(keyed(`import './side.js';\n`, 'src/f.ts')).toEqual({});
  });

  it('keeps namespace and default bindings', () => {
    expect(
      keyed(
        `import * as ns from './n.js';\nimport d from './d.js';\nexport const z = [ns, d];\n`,
        'src/f.ts'
      )
    ).toEqual({ 'src/n': ['ns'], 'src/d': ['d'] });
  });

  it('merges two declarations of one module into one key carrying both names', () => {
    expect(
      keyed(
        `import { a } from './m.js';\nimport { b } from './m.ts';\nexport const z = [a, b];\n`,
        'src/f.ts'
      )
    ).toEqual({ 'src/m': ['a', 'b'] });
  });

  it('drops bare specifiers', () => {
    expect(
      keyed(`import { join } from 'node:path';\nexport const z = join;\n`, 'src/f.ts')
    ).toEqual({});
  });

  it('records every identifier position of a kept binding, ascending', () => {
    const src = `import { h } from './h.js';\nexport const a = h;\nexport const b = h;\n`;
    const { positions } = collectFileImports(programOf(src), 'src/f.ts');
    const at = positions.get('h');
    expect(at).toHaveLength(3); // the specifier itself plus the two references
    expect([...at!]).toEqual([...at!].slice().sort((x, y) => x - y));
    expect(at![0]).toBe(src.indexOf('h'));
  });
});

describe('usedImportKeys', () => {
  const src = [
    `import { helper } from './helper.js';`,
    `export function first(a: string): string {`,
    `  return a.trim();`,
    `}`,
    `export function second(b: string): string {`,
    `  return helper(b);`,
    `}`,
  ].join('\n');

  function unitRange(name: string): readonly [number, number] {
    const program = programOf(src);
    const unit = extractUnits(program).find((u) => u.name === name);
    if (unit === undefined) throw new Error(`no unit named ${name}`);
    return unit.range;
  }

  it('is empty for a unit whose range precedes the only reference', () => {
    // `helper` appears twice in the file: in the import specifier (BEFORE
    // `first`) and in `second`'s body (AFTER it). Neither is inside `first`.
    // This is the case the `offset > end` early return decides: without it the
    // scan walks on to `second`'s offset and reports a false positive.
    const imports = collectFileImports(programOf(src), 'src/main.ts');
    expect(usedImportKeys(imports, unitRange('first'))).toEqual([]);
  });

  it('names the module for a unit that references the binding in its body', () => {
    const imports = collectFileImports(programOf(src), 'src/main.ts');
    expect(usedImportKeys(imports, unitRange('second'))).toEqual(['src/helper']);
  });

  it('returns keys sorted, not in declaration order', () => {
    const two = [
      `import { z } from './zeta.js';`,
      `import { a } from './alpha.js';`,
      `export function both(): number {`,
      `  return z + a;`,
      `}`,
    ].join('\n');
    const program = programOf(two);
    const unit = extractUnits(program).find((u) => u.name === 'both')!;
    const imports = collectFileImports(program, 'src/main.ts');
    expect(usedImportKeys(imports, unit.range)).toEqual(['src/alpha', 'src/zeta']);
  });

  it('is empty when the file has no first-party value import at all', () => {
    const none = `export function solo(): number {\n  return 1;\n}\n`;
    const program = programOf(none);
    const unit = extractUnits(program).find((u) => u.name === 'solo')!;
    expect(usedImportKeys(collectFileImports(program, 'src/main.ts'), unit.range)).toEqual([]);
  });
});

describe('sharedImportKey', () => {
  it('returns the one key present in every member', () => {
    expect(
      sharedImportKey([
        ['a', 'b'],
        ['b', 'c'],
      ])
    ).toBe('b');
  });

  it('returns undefined when the members share nothing', () => {
    expect(sharedImportKey([['a'], ['b']])).toBeUndefined();
  });

  it('returns undefined for no members and for a member with no keys', () => {
    expect(sharedImportKey([])).toBeUndefined();
    expect(sharedImportKey([['a'], []])).toBeUndefined();
    expect(sharedImportKey([[], ['a']])).toBeUndefined();
  });

  it('picks the lexicographically smallest shared key, whatever the member order', () => {
    // `sharedImport` is one field, so with two shared modules the pick must be
    // total and order-independent — not "whichever file was discovered first".
    // The calls below differ ONLY in the order of the member arrays and of the
    // keys within them; every one must answer 'a'.
    expect(
      sharedImportKey([
        ['a', 'z'],
        ['a', 'z'],
      ])
    ).toBe('a');
    expect(
      sharedImportKey([
        ['z', 'a'],
        ['a', 'z'],
      ])
    ).toBe('a');
    expect(
      sharedImportKey([
        ['a', 'z'],
        ['z', 'a'],
      ])
    ).toBe('a');
    const members = [
      ['src/n', 'src/m'],
      ['src/m', 'src/n'],
      ['src/n', 'src/m'],
    ];
    expect(sharedImportKey(members)).toBe(sharedImportKey([...members].reverse()));
    expect(sharedImportKey(members)).toBe('src/m');
  });

  it('answers the smallest key of a lone member, unsorted input included', () => {
    expect(sharedImportKey([['src/z', 'src/b']])).toBe('src/b');
  });
});
