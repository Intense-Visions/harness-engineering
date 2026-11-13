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

  it('does not collapse same-named methods on different types', async () => {
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
