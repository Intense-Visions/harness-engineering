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
