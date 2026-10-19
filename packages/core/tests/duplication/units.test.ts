import { describe, it, expect } from 'vitest';
import { parse } from '@typescript-eslint/typescript-estree';
import { extractUnits } from '../../src/duplication/units';

function unitsOf(src: string) {
  return extractUnits(parse(src, { tokens: true, loc: true, range: true }));
}

describe('extractUnits', () => {
  it('extracts a named function declaration as kind function', () => {
    const units = unitsOf(`export function f(a: number) {\n  return a;\n}\n`);
    expect(units.map((u) => [u.kind, u.name, u.startLine, u.endLine])).toEqual([
      ['function', 'f', 1, 3],
    ]);
  });

  it('excludes the export keyword from the unit range', () => {
    const src = `export function f() { return 1; }`;
    const [unit] = unitsOf(src);
    expect(src.slice(unit!.range[0], unit!.range[1]).startsWith('function')).toBe(true);
  });

  it('extracts a class and its method without a duplicate anonymous function', () => {
    // MethodDefinition.value is itself a FunctionExpression. Without the
    // dedupe this yields THREE overlapping units at the same start line.
    const units = unitsOf(
      `export class Box {\n  tally(xs: number[]) {\n    return xs.length;\n  }\n}\n`
    );
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['class:Box', 'method:tally']);
  });

  it('still extracts a class-field arrow function as its own unit', () => {
    const units = unitsOf(`class Box {\n  handler = (x: number) => x + 1;\n}\n`);
    expect(units.map((u) => u.kind)).toEqual(['class', 'function']);
  });

  it('names a function expression or arrow function <anon>', () => {
    const units = unitsOf(`const f = (a: number) => a + 1;\n`);
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['function:<anon>']);
  });

  it('extracts nested units (an inner arrow inside a function)', () => {
    const units = unitsOf(`function g() {\n  return [1].map((x) => x * 2);\n}\n`);
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['function:g', 'function:<anon>']);
  });

  it('returns units in deterministic source order', () => {
    const units = unitsOf(`function a() { return 1; }\nfunction b() { return 2; }\n`);
    expect(units.map((u) => u.range[0])).toEqual(
      [...units.map((u) => u.range[0])].sort((x, y) => x - y)
    );
  });

  it('returns an empty array for a file with no units', () => {
    expect(unitsOf(`export const x = 1;\n`)).toEqual([]);
  });
});
