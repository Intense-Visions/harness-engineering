/**
 * The craft family's single multi-language extraction seam.
 *
 * Four behavioural laws live here, one per measured trap: children recursion,
 * (kind, qualifiedName) de-duplication, Go kind normalization, and the
 * substantiveness span bar. They are in ONE module because each has a named
 * mutant, and four copies of an adapter would mean one mutant reddens one copy
 * while three silent holes survive.
 *
 * Source: docs/changes/auto-wire-craft-at-review/plans/2026-11-13-multi-language-craft-extraction-plan.md
 */

import { describe, it, expect } from 'vitest';
import {
  extractOutlineUnits,
  usesOutlineExtraction,
} from '../../../../src/shared/craft/extract/outline-units';
import { SEED_RUBRICS, rubricApplies } from '../../../../src/code-craft/catalog/rubrics/index';

describe('language routing', () => {
  it.each([
    ['cart.py', true],
    ['cart.go', true],
    ['cart.rs', true],
    ['Cart.java', true],
  ])('routes %s through the outline', (file, expected) => {
    expect(usesOutlineExtraction(file as string)).toBe(expected);
  });

  it.each(['cart.ts', 'cart.tsx', 'cart.js', 'cart.mjs', 'cart.cjs'])(
    'leaves %s to the TS Compiler extractor',
    (file) => {
      expect(usesOutlineExtraction(file)).toBe(false);
    }
  );

  it('does not claim an unmapped extension', () => {
    expect(usesOutlineExtraction('notes.txt')).toBe(false);
  });

  it('returns no units for a file it does not route', async () => {
    expect(await extractOutlineUnits('export function f() {}', 'cart.ts')).toEqual([]);
  });

  it('returns a named function as a unit (positive control for the whole module)', async () => {
    const source = [
      'def compute_total(items):',
      '    t = 0',
      '    for i in items:',
      '        t += i',
      '    return t',
    ].join('\n');
    const units = await extractOutlineUnits(source, 'cart.py');
    expect(units).toContainEqual({ kind: 'function', name: 'compute_total', line: 1, endLine: 5 });
  });
});

describe('law: methods nested as children become units (M-REC)', () => {
  const java = [
    'package cart;',
    '',
    'public class Cart {',
    '    public int computeTotal() {',
    '        int t = 0;',
    '        t += 1;',
    '        return t;',
    '    }',
    '}',
  ].join('\n');

  it('returns the method, not only its enclosing class', async () => {
    const units = await extractOutlineUnits(java, 'Cart.java');
    const names = units.map((u) => `${u.kind}:${u.name}`);
    // Java emits ONE top-level symbol. A flat read of `symbols` returns only
    // the class and reads as broken extraction.
    expect(names).toContain('class:Cart');
    expect(names).toContain('method:computeTotal');
  });

  it('returns the method for python too, where the class also nests', async () => {
    const py = [
      'class Cart:',
      '    def add(self, n):',
      '        self.items = []',
      '        self.n = n',
      '        return n',
    ].join('\n');
    const units = await extractOutlineUnits(py, 'cart.py');
    expect(units.map((u) => `${u.kind}:${u.name}`)).toContain('method:add');
  });
});

describe('law: a type declared twice yields one unit (M-DEDUP)', () => {
  const rust = [
    'pub struct Cart {',
    '    items: Vec<i32>,',
    '}',
    '',
    'impl Cart {',
    '    pub fn add(&mut self, n: i32) {',
    '        self.items.push(n);',
    '    }',
    '}',
  ].join('\n');

  it('emits Cart once, not once per struct and once per impl', async () => {
    const units = await extractOutlineUnits(rust, 'cart.rs');
    const carts = units.filter((u) => u.kind === 'class' && u.name === 'Cart');
    expect(carts).toHaveLength(1);
  });

  it('keeps the declaration site as the anchor', async () => {
    const units = await extractOutlineUnits(rust, 'cart.rs');
    const cart = units.find((u) => u.kind === 'class' && u.name === 'Cart');
    expect(cart?.line).toBe(1); // the `struct`, not the `impl` at line 5
  });

  it('does not lose the impl block methods to the dedup', async () => {
    const units = await extractOutlineUnits(rust, 'cart.rs');
    expect(units).toContainEqual({ kind: 'method', name: 'add', line: 6, endLine: 8 });
  });

  // THE JAVA CASE PROVES THE PROPERTY ONLY WHERE IT WAS ALREADY TRUE. Java
  // nests methods under their class, so the outline supplies a parent and
  // `qualifiedName` disambiguates on its own. The two languages that need this
  // law most supply NO parent, and until the key carried `line` they silently
  // lost a unit. Those cases are the three below; this one stays as the
  // parented-family control.
  it('does not collapse same-named methods on different types (java: parented)', async () => {
    const java = [
      'public class Cart {',
      '    public void add(int n) {',
      '        this.n = n;',
      '        this.m = n;',
      '    }',
      '}',
      'class Bag {',
      '    public void add(int n) {',
      '        this.n = n;',
      '        this.m = n;',
      '    }',
      '}',
    ].join('\n');
    const units = await extractOutlineUnits(java, 'Cart.java');
    expect(units.filter((u) => u.kind === 'method' && u.name === 'add')).toHaveLength(2);
  });
});

describe('law: a Go struct selects at least one rubric (M-KIND)', () => {
  const go = [
    'package cart',
    '',
    'type Cart struct {',
    '    items []int',
    '    total int',
    '}',
    '',
    'func (c *Cart) Add(n int) {',
    '    c.items = append(c.items, n)',
    '    c.total += n',
    '}',
  ].join('\n');

  it('emits the struct as a class-kinded unit', async () => {
    const units = await extractOutlineUnits(go, 'cart.go');
    expect(units).toContainEqual({ kind: 'class', name: 'Cart', line: 3, endLine: 6 });
  });

  // THIS is the law. A unit COUNT is not evidence of critique: all seven
  // rubrics declare appliesToKinds of ['function','method','class'] or
  // ['function','method'], and selection is `appliesToKinds.includes(kind)`.
  // Go emits `type` for a struct, so an un-normalized unit is extracted,
  // counted, and then critiqued by nothing — the same silent zero arriving
  // through the rubric selector instead of the language gate.
  it('selects a non-zero number of rubrics for every unit', async () => {
    const units = await extractOutlineUnits(go, 'cart.go');
    expect(units.length).toBeGreaterThan(0); // positive control for the loop below
    for (const unit of units) {
      const selected = SEED_RUBRICS.filter((r) => rubricApplies(r, unit.kind));
      expect(selected.length, `${unit.kind}:${unit.name} selected zero rubrics`).toBeGreaterThan(0);
    }
  });

  it('keeps the Go method, which is emitted top level and not as a child', async () => {
    const units = await extractOutlineUnits(go, 'cart.go');
    expect(units).toContainEqual({ kind: 'method', name: 'Add', line: 8, endLine: 11 });
  });
});

describe('law: trivial units are not billed (M-SPAN)', () => {
  it.each([
    [
      'cart.py',
      [
        'def tiny(): return 1',
        '',
        'def real(items):',
        '    t = 0',
        '    t += 1',
        '    return t',
      ].join('\n'),
    ],
    [
      'cart.go',
      [
        'package cart',
        '',
        'func tiny() int { return 1 }',
        '',
        'func real(n int) int {',
        '    t := 0',
        '    t += n',
        '    return t',
        '}',
      ].join('\n'),
    ],
    [
      'cart.rs',
      [
        'fn tiny() -> i32 { 1 }',
        '',
        'fn real(n: i32) -> i32 {',
        '    let mut t = 0;',
        '    t += n;',
        '    t',
        '}',
      ].join('\n'),
    ],
  ])('drops the one-liner and keeps the real unit in %s', async (file, source) => {
    const units = await extractOutlineUnits(source, file);
    const names = units.map((u) => u.name);
    expect(names).not.toContain('tiny');
    expect(names).toContain('real'); // positive control: the filter is not eating everything
  });
});

/**
 * C1 regression. The dedup key degenerated to a bare name wherever the outline
 * supplies no parent, and silently dropped the second declaration. Each case
 * below is the single most common shape its language has, and each pairs the
 * survival assertion with a POSITIVE CONTROL naming the unit that always
 * survived, so a green cannot come from an extractor that returns everything.
 */
describe('law: a same-named declaration without an outline parent survives (M-DEDUP-METHOD)', () => {
  it('go: two receivers declare Add, and BOTH are units', async () => {
    const go = [
      'package cart', //                     1
      '', //                                 2
      'type Cart struct {', //               3
      '    items []int', //                  4
      '    total int', //                    5
      '}', //                                6
      'type Bag struct {', //                7
      '    items []int', //                  8
      '    total int', //                    9
      '}', //                                10
      'func (c *Cart) Add(n int) {', //      11
      '    c.items = append(c.items, n)', // 12
      '    c.total += n', //                 13
      '}', //                                14
      'func (b *Bag) Add(n int) {', //       15
      '    b.items = append(b.items, n)', // 16
      '    b.total += n', //                 17
      '}', //                                18
    ].join('\n');
    const units = await extractOutlineUnits(go, 'two.go');
    const adds = units.filter((u) => u.kind === 'method' && u.name === 'Add');
    expect(
      adds.map((u) => u.line),
      'Go methods are TOP LEVEL, so parentName is null for both and a bare-name key drops Bag.Add'
    ).toEqual([11, 15]);
    // POSITIVE CONTROL: the structs are still deduped to one unit each.
    expect(units.filter((u) => u.kind === 'class').map((u) => u.name)).toEqual(['Cart', 'Bag']);
  });

  it('rust: two trait impls for one type both declare from, and BOTH are units', async () => {
    const rs = [
      'pub struct Cart {', //                1
      '    items: Vec<i32>,', //             2
      '}', //                                3
      'impl From<i32> for Cart {', //        4
      '    fn from(n: i32) -> Self {', //    5
      '        let v = vec![n];', //         6
      '        Cart { items: v }', //        7
      '    }', //                            8
      '}', //                                9
      'impl From<u8> for Cart {', //         10
      '    fn from(n: u8) -> Self {', //     11
      '        let v = vec![n as i32];', //  12
      '        Cart { items: v }', //        13
      '    }', //                            14
      '}', //                                15
    ].join('\n');
    const units = await extractOutlineUnits(rs, 'two.rs');
    const froms = units.filter((u) => u.kind === 'method' && u.name === 'from');
    expect(
      froms.map((u) => u.line),
      'getRustImplName returns the TYPE not the trait, so both impls report parent `Cart`'
    ).toEqual([5, 11]);
    // POSITIVE CONTROL: Cart itself is still ONE unit despite struct + 2 impls.
    expect(units.filter((u) => u.kind === 'class' && u.name === 'Cart')).toHaveLength(1);
  });

  it('rust: nested mods declaring the same fn name keep both', async () => {
    const rs = [
      'mod a {', //                 1
      '    mod b {', //             2
      '        pub fn f() {', //    3
      '            let x = 1;', //  4
      '            let y = 2;', //  5
      '        }', //               6
      '    }', //                   7
      '    pub fn f() {', //        8
      '        let z = 3;', //      9
      '        let w = 4;', //      10
      '    }', //                   11
      '}', //                       12
    ].join('\n');
    const units = await extractOutlineUnits(rs, 'nested.rs');
    expect(
      units.filter((u) => u.kind === 'function' && u.name === 'f').map((u) => u.line),
      'mod contents are spliced in at top level WITHOUT the mod name, so both are `function:f`'
    ).toEqual([3, 8]);
  });

  // THE OTHER HALF OF THE FIX. Adding `line` back for function/method must not
  // resurrect the class duplicate the line-less key exists to collapse.
  it('still collapses the struct+impl double emission it was written for', async () => {
    const rs = [
      'pub struct C {', //            1
      '    a: i32,', //               2
      '}', //                         3
      'impl C {', //                  4
      '    pub fn one(&self) -> i32 {', // 5
      '        let x = 1;', //        6
      '        x', //                 7
      '    }', //                     8
      '}', //                         9
      'impl C {', //                  10
      '    pub fn two(&self) -> i32 {', // 11
      '        let x = 2;', //        12
      '        x', //                 13
      '    }', //                     14
      '}', //                         15
    ].join('\n');
    const units = await extractOutlineUnits(rs, 'split.rs');
    // One struct + TWO inherent impl blocks = three `class:C` emissions, one unit.
    expect(units.filter((u) => u.kind === 'class' && u.name === 'C')).toHaveLength(1);
    // POSITIVE CONTROL: both impl blocks' methods survive independently.
    expect(units.filter((u) => u.kind === 'method').map((u) => u.name)).toEqual(['one', 'two']);
  });
});
