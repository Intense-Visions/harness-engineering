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

  it('records every CALL SITE of a kept binding, ascending, and nothing else', () => {
    // Four mentions of `h`, two of which are qualifying uses: the import
    // specifier itself and the bare read `const c = h` are not call sites, so
    // only the two callee offsets are recorded. Under the token-spelling
    // predicate this answered 4.
    const src =
      `import { h } from './h.js';\n` +
      `export const a = h(1);\n` +
      `export const b = h(2);\n` +
      `export const c = h;\n`;
    const { positions } = collectFileImports(programOf(src), 'src/f.ts');
    const at = positions.get('h');
    expect(at).toHaveLength(2);
    expect([...at!]).toEqual([...at!].slice().sort((x, y) => x - y));
    expect(at![0]).toBe(src.indexOf('h(1)'));
    expect(at![1]).toBe(src.indexOf('h(2)'));
    // The import specifier's own token is BEFORE both and is not one of them.
    expect(at![0]).toBeGreaterThan(src.indexOf('h'));
  });

  it('records a method-call RECEIVER and a JSX element name', () => {
    const src =
      `import { fmt } from './fmt.js';\n` +
      `export function go(x: string) {\n` +
      `  return fmt.render(x);\n` +
      `}\n`;
    const { positions } = collectFileImports(programOf(src), 'src/f.ts');
    expect(positions.get('fmt')).toEqual([src.indexOf('fmt.render')]);

    const jsx = `import { Row } from './row.js';\nexport const W = () => <Row.Cell />;\n`;
    const parsed = parse(jsx, { tokens: true, loc: true, range: true, jsx: true });
    expect(collectFileImports(parsed, 'src/w.tsx').positions.get('Row')).toEqual([
      jsx.indexOf('Row.Cell'),
    ]);
  });

  it('records NOTHING for a bare property read, a member property, an object key or a type', () => {
    // The four mislabel shapes the role filter removes by construction. Each
    // file mentions the import's name and calls nothing through it.
    const cases: Array<[string, string]> = [
      ['bare property read', `import { M } from './m.js';\nexport const a = M.JSON;\n`],
      ['member property', `import { extract } from './e.js';\nexport const a = [].extract;\n`],
      [
        'object-literal key',
        `import { extract } from './e.js';\nexport const o = { extract: 1 };\n`,
      ],
      [
        'value import used as a type',
        `import { Fmt } from './f.js';\nexport function go(a: Fmt): void {\n  void a;\n}\n`,
      ],
      [
        'method named like the import',
        `import { extract } from './e.js';\nexport class A {\n  extract(): number {\n    return 1;\n  }\n}\n`,
      ],
    ];
    for (const [label, src] of cases) {
      const { positions } = collectFileImports(programOf(src), 'src/f.ts');
      expect([...positions.keys()], label).toEqual([]);
    }
  });

  it('drops a local whose name is ALSO declared in the file, rather than guessing scope', () => {
    // A shadowing parameter makes the callee a use of a DIFFERENT binding, and
    // this module has no scope manager. The conservative answer drops the key:
    // a false NEGATIVE, never a false positive.
    const src =
      `import { extract } from './e.js';\n` +
      `export function go(extract: (s: string) => string): string {\n` +
      `  return extract('x');\n` +
      `}\n`;
    expect(keyed(src, 'src/f.ts')).toEqual({});

    // Destructured parameters, variable declarators and catch params count too.
    for (const decl of [
      `export function go({ extract }: { extract: () => void }) {\n  extract();\n}\n`,
      `export function go() {\n  const extract = () => 1;\n  return extract();\n}\n`,
      `export function go() {\n  try {\n    return 1;\n  } catch (extract) {\n    return 0;\n  }\n}\n`,
    ]) {
      expect(keyed(`import { extract } from './e.js';\n` + decl, 'src/f.ts')).toEqual({});
    }
  });

  it('keeps a key whose OTHER local is unshadowed', () => {
    const src =
      `import { a, b } from './m.js';\n` +
      `export function go(a: number): number {\n` +
      `  return a + b();\n` +
      `}\n`;
    expect(keyed(src, 'src/f.ts')).toEqual({ 'src/m': ['b'] });
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
      `  return z() + a();`,
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

describe('usedImportKeys — the exported range contract', () => {
  /**
   * `usedImportKeys` is an exported API (spec criterion 11), so its range bound
   * is a contract a caller may hold a hand-built `FileImports` against, not an
   * internal detail. These cases pin both ends of `[start, end]` directly.
   *
   * Worth stating plainly: from this repository's own `fingerprintFile` path the
   * `offset === start` case is now UNREACHABLE. It used to be reachable — a
   * non-computed method's own name token starts exactly at its unit's start
   * offset, which is how one fixture class was labelled twice — and the role
   * filter removed that witness, because a method key is in no callee position.
   * The inclusive bound is still the published contract, and this is where it is
   * asserted rather than inferred.
   */
  const imports = (offsets: number[]) => ({
    byKey: new Map([['src/m', ['m']]]),
    positions: new Map([['m', offsets]]),
  });

  it('counts a use starting exactly at the unit START offset', () => {
    expect(usedImportKeys(imports([100]), [100, 200])).toEqual(['src/m']);
  });

  it('counts a use starting exactly at the unit END offset', () => {
    expect(usedImportKeys(imports([200]), [100, 200])).toEqual(['src/m']);
  });

  it('counts neither side of the range', () => {
    expect(usedImportKeys(imports([99]), [100, 200])).toEqual([]);
    expect(usedImportKeys(imports([201]), [100, 200])).toEqual([]);
    expect(usedImportKeys(imports([99, 201]), [100, 200])).toEqual([]);
  });

  it('stops at the first offset past END rather than scanning on', () => {
    // Ascending by contract: once one offset is past `end`, every later one is
    // too. A later offset INSIDE the range would contradict the ordering, so
    // this case asserts the early exit is sound, not that it is lossy.
    expect(usedImportKeys(imports([201, 202, 203]), [100, 200])).toEqual([]);
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
