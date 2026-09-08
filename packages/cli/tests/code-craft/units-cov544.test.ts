import { describe, it, expect } from 'vitest';
import { extractUnits, unitSource } from '../../src/code-craft/extract/units.js';
import type { CodeUnit } from '../../src/code-craft/findings/schema.js';

/**
 * Branch-coverage tests for the code-craft unit extractor: substantive vs
 * trivial function/method/class filtering, name recovery from binding sites,
 * control-flow detection in expression-bodied arrows, dedup, guards, and the
 * unitSource slice/truncate helper.
 */

function names(units: CodeUnit[]): string[] {
  return units.map((u) => u.name);
}

describe('extractUnits guards', () => {
  it('returns [] for a non-source file', () => {
    expect(extractUnits('function f(){}', 'notes.md')).toEqual([]);
  });

  it('returns [] when there is no substantive unit', () => {
    expect(extractUnits('const a = 1;', 'x.ts')).toEqual([]);
  });
});

describe('function substance filter', () => {
  it('emits a function with >= 3 statements', () => {
    const units = extractUnits('function f(){ const a=1; const b=2; return a+b; }', 'x.ts');
    expect(names(units)).toContain('f');
  });

  it('emits a short function that contains control flow', () => {
    const units = extractUnits('function g(x){ if (x) return 1; }', 'x.ts');
    expect(names(units)).toContain('g');
  });

  it('skips a trivial one-line function', () => {
    const units = extractUnits('function h(x){ return x; }', 'x.ts');
    expect(names(units)).not.toContain('h');
  });

  it('skips an overload signature (no body)', () => {
    const src = 'function o(a: number): number;\nfunction o(a: any){ return a; }';
    // The declaration-only overload has no body; only the implementation counts,
    // and it is trivial, so no unit is emitted for the overload signature.
    const units = extractUnits(src, 'x.ts');
    expect(units.filter((u) => u.name === 'o' && u.endLine === u.line)).toHaveLength(0);
  });
});

describe('arrow / expression bodies', () => {
  it('names an arrow from its const binding when substantive', () => {
    const units = extractUnits(
      'const add = (a,b) => { const s=a+b; const t=s*2; return t; };',
      'x.ts'
    );
    expect(names(units)).toContain('add');
  });

  it('emits an expression-bodied arrow only when it hides control flow', () => {
    const withFlow = extractUnits('const pick = (x) => x ? 1 : 2;', 'x.ts');
    expect(names(withFlow)).toContain('pick');
    const trivial = extractUnits('const id = (x) => x;', 'x.ts');
    expect(names(trivial)).not.toContain('id');
  });

  it('classifies a property-assigned arrow as a method', () => {
    const src = 'const obj = { run: (a,b) => { const s=a; const t=b; return s+t; } };';
    const units = extractUnits(src, 'x.ts');
    const run = units.find((u) => u.name === 'run');
    expect(run?.kind).toBe('method');
  });

  it('falls back to <anonymous> for an unbound function expression', () => {
    const src = '(function(){ const a=1; const b=2; return a+b; })();';
    const units = extractUnits(src, 'x.ts');
    expect(names(units)).toContain('<anonymous>');
  });
});

describe('class substance filter', () => {
  it('emits a class with a method', () => {
    const units = extractUnits('class C { m(){ return 1; } }', 'x.ts');
    expect(units.some((u) => u.kind === 'class' && u.name === 'C')).toBe(true);
  });

  it('emits a class with a non-empty constructor', () => {
    const units = extractUnits('class D { constructor(){ this.x = 1; } }', 'x.ts');
    expect(units.some((u) => u.kind === 'class' && u.name === 'D')).toBe(true);
  });

  it('skips an empty class', () => {
    const units = extractUnits('class E {}', 'x.ts');
    expect(units.some((u) => u.kind === 'class')).toBe(false);
  });

  it('names an anonymous class expression', () => {
    const units = extractUnits('const K = class { m(){ return 1; } };', 'x.ts');
    expect(units.some((u) => u.name === '<anonymous class>')).toBe(true);
  });
});

describe('unitSource', () => {
  it('slices the unit lines from source', () => {
    const src = 'a\nb\nc\nd\ne';
    const unit: CodeUnit = { kind: 'function', name: 'f', line: 2, endLine: 4 };
    expect(unitSource(src, unit, 100)).toBe('b\nc\nd');
  });

  it('truncates a slice that exceeds maxChars', () => {
    const src = 'xxxxxxxxxx\nyyyyyyyyyy';
    const unit: CodeUnit = { kind: 'function', name: 'f', line: 1, endLine: 2 };
    const out = unitSource(src, unit, 5);
    expect(out).toContain('truncated for cost');
    expect(out.startsWith('xxxxx')).toBe(true);
  });
});
