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

describe('extractUnits — traversal safety', () => {
  /**
   * `@typescript-eslint/parser` and ESLint set `parent` back-pointers on every
   * node. Following them makes the walk cyclic: before NON_CHILD_KEYS + the
   * visited set, this overflowed the stack even at --stack-size=2000.
   */
  it('does not overflow on an AST carrying parent back-pointers', () => {
    const ast = parse('class K { m(a, b) { return [1].map((x) => x * 2); } }', {
      tokens: true,
      loc: true,
      range: true,
    });
    const withoutParents = extractUnits(ast).map((u) => `${u.kind}:${u.name}`);

    const link = (node: unknown, parent: unknown): void => {
      if (node === null || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (typeof record['type'] === 'string') record['parent'] = parent;
      for (const [key, value] of Object.entries(record)) {
        if (key === 'parent') continue;
        if (Array.isArray(value)) {
          for (const item of value) link(item, node);
        } else {
          link(value, node);
        }
      }
    };
    link(ast, null);

    expect(() => extractUnits(ast)).not.toThrow();
    expect(extractUnits(ast).map((u) => `${u.kind}:${u.name}`)).toEqual(withoutParents);
  });

  it('ignores program-level tokens and comments rather than walking them', () => {
    // A token object has `type: 'Identifier'`, which is NOT a UNIT_KINDS key, so
    // this never produced phantom units — but it was traversed for every file.
    // `comment: true` is set here deliberately: the production parse in
    // `fingerprintFile` does NOT set it, so `comments` is normally absent. This
    // pins the skip for callers who do pass it.
    const ast = parse('// lead\nfunction solo(a) { return a; }', {
      tokens: true,
      comment: true,
      loc: true,
      range: true,
    });
    expect(ast.tokens?.length ?? 0).toBeGreaterThan(0);
    expect(ast.comments?.length ?? 0).toBeGreaterThan(0);
    expect(extractUnits(ast).map((u) => u.name)).toEqual(['solo']);
  });
});
