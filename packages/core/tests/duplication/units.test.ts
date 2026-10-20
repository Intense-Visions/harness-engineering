import { describe, it, expect } from 'vitest';
import { parse } from '@typescript-eslint/typescript-estree';
import { extractUnits, MissingNodeLocationError } from '../../src/duplication/units';

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

  it('names an arrow function from its variable binding one hop up', () => {
    // `const sendJSON = (res, status, body) => {…}` is not anonymous to anyone
    // reading it. Re-measured at HEAD: 17 of the 230 members in reported
    // classes are still `<anon>` (they need a callee hop, not a parent hop).
    const units = unitsOf(`const f = (a: number) => a + 1;\n`);
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['function:f']);
  });

  it('names a function expression from its variable binding one hop up', () => {
    const units = unitsOf(`const g = function (a: number) {\n  return a;\n};\n`);
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['function:g']);
  });

  it('names an object-literal method and a string-keyed function from the property key', () => {
    const units = unitsOf(
      `const api = {\n  send(a: number) {\n    return a;\n  },\n` +
        `  'send-json': function (b: number) {\n    return b;\n  },\n` +
        `  later: (c: number) => c,\n};\n`
    );
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual([
      'function:send',
      'function:send-json',
      'function:later',
    ]);
  });

  it('names a class-field arrow from its property definition', () => {
    const units = unitsOf(`class Box {\n  handler = (x: number) => x + 1;\n}\n`);
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['class:Box', 'function:handler']);
  });

  it('keeps <anon> for a computed key, a bare argument, and a default export', () => {
    const key = unitsOf(`const k = 'x';\nconst o = { [k]: (a: number) => a };\n`);
    expect(key.map((u) => u.name)).toEqual(['<anon>']);
    // The unit's OWN computed key, not a parent's: `[k]()` was reported as `k`
    // because the guard existed on the parent path only.
    const method = unitsOf(`const k = 'x';\nclass A {\n  [k]() {\n    return 1;\n  }\n}\n`);
    expect(method.map((x) => `${x.kind}:${x.name}`)).toEqual(['class:A', 'method:<anon>']);
    const field = unitsOf(`const k = 'x';\nclass B {\n  [k] = (a: number) => a;\n}\n`);
    expect(field.map((x) => `${x.kind}:${x.name}`)).toEqual(['class:B', 'function:<anon>']);
    // A quoted (non-computed) key still names its method.
    const quoted = unitsOf(`class C {\n  'm'() {\n    return 1;\n  }\n}\n`);
    expect(quoted.map((x) => `${x.kind}:${x.name}`)).toEqual(['class:C', 'method:m']);
    const arg = unitsOf(`run((a: number) => a + 1);\n`);
    expect(arg.map((u) => u.name)).toEqual(['<anon>']);
    const def = unitsOf(`export default function (a: number) {\n  return a;\n}\n`);
    expect(def.map((u) => u.name)).toEqual(['<anon>']);
  });

  it('does not name a unit from a binding it is not the value of', () => {
    // The arrow is the parameter's DEFAULT, not the declarator's init, so the
    // `outer` binding must not claim it.
    const units = unitsOf(`const outer = function (cb = (a: number) => a) {\n  return cb;\n};\n`);
    expect(units.map((u) => `${u.kind}:${u.name}`)).toEqual(['function:outer', 'function:<anon>']);
  });

  it('extracts a class expression as a class, symmetrically with a declaration', () => {
    const expr = unitsOf(`const K = class {\n  m() {\n    return 1;\n  }\n};\n`);
    expect(expr.map((u) => `${u.kind}:${u.name}`)).toEqual(['class:K', 'method:m']);
    const decl = unitsOf(`class K {\n  m() {\n    return 1;\n  }\n}\n`);
    expect(decl.map((u) => `${u.kind}:${u.name}`)).toEqual(['class:K', 'method:m']);
  });

  it('includes a decorator in the class unit range, so startLine is the decorator line', () => {
    const src = `@dec\nclass A {\n  m() {\n    return 1;\n  }\n}\n`;
    const [unit] = unitsOf(src);
    expect(unit!.kind).toBe('class');
    expect(unit!.startLine).toBe(1);
    expect(src.slice(unit!.range[0], unit!.range[1]).startsWith('@dec')).toBe(true);
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

  it('throws a typed error on an AST parsed without loc instead of reading undefined', () => {
    // extractUnits is a public export with no enforced precondition: before the
    // guard this was `TypeError: Cannot read properties of undefined (reading
    // 'start')` from inside toUnit, and the contract held only because the one
    // internal caller happened to pass `loc: true`.
    const ast = parse('function f(a) { return a; }', { tokens: true, range: true, loc: false });
    expect(() => extractUnits(ast)).toThrow(MissingNodeLocationError);
    expect(() => extractUnits(ast)).toThrow(/parsed with \{ loc: true, range: true \}/);
    try {
      extractUnits(ast);
      expect.unreachable('expected MissingNodeLocationError');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingNodeLocationError);
      expect((e as MissingNodeLocationError).nodeType).toBe('FunctionDeclaration');
      expect((e as MissingNodeLocationError).field).toBe('loc');
    }
  });

  it('throws a typed error on an AST parsed without range', () => {
    const ast = parse('function f(a) { return a; }', { tokens: true, range: false, loc: true });
    try {
      extractUnits(ast);
      expect.unreachable('expected MissingNodeLocationError');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingNodeLocationError);
      expect((e as MissingNodeLocationError).field).toBe('range');
    }
  });

  /**
   * A unit-shaped object to plant where the walk must not look.
   *
   * Real tokens carry `type: 'Keyword' | 'Identifier' | 'Punctuator'` and real
   * comments `'Line' | 'Block'` — none of which is a UNIT_KINDS key, so a test
   * that merely parses a commented file and asserts one unit CANNOT fail:
   * traversing `tokens` and `comments` emits nothing either way. These decoys
   * make the skip observable.
   */
  const decoyUnit = (name: string) => ({
    type: 'FunctionDeclaration',
    id: { type: 'Identifier', name },
    params: [],
    body: { type: 'BlockStatement', body: [] },
    loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    range: [0, 1],
  });

  it('ignores program-level tokens and comments rather than walking them', () => {
    const ast = parse('// lead\nfunction solo(a) { return a; }', {
      tokens: true,
      comment: true,
      loc: true,
      range: true,
    });
    expect(ast.tokens?.length ?? 0).toBeGreaterThan(0);
    expect(ast.comments?.length ?? 0).toBeGreaterThan(0);

    ast.tokens?.push(decoyUnit('phantomFromTokens') as never);
    ast.comments?.push(decoyUnit('phantomFromComments') as never);

    // Dropping 'tokens','comments' from NON_CHILD_KEYS yields
    // ['phantomFromComments', 'phantomFromTokens', 'solo'] here.
    expect(extractUnits(ast).map((u) => u.name)).toEqual(['solo']);
  });

  it('terminates on a cycle through a key NON_CHILD_KEYS does not filter', () => {
    // The parent-pointer test above passes because of NON_CHILD_KEYS.has('parent'),
    // not because of the visited set, so it leaves the `seen` guard unpinned.
    // `cycleRef` is filtered by nothing, so only `seen` can stop this walk.
    const ast = parse('class K { m(a) { return [1].map((x) => x * 2); } }', {
      tokens: true,
      loc: true,
      range: true,
    });
    const expected = extractUnits(ast).map((u) => `${u.kind}:${u.name}`);

    const classNode = ast.body[0] as unknown as Record<string, unknown>;
    const classBody = classNode['body'] as Record<string, unknown>;
    classBody['cycleRef'] = classNode;

    expect(() => extractUnits(ast)).not.toThrow();
    expect(extractUnits(ast).map((u) => `${u.kind}:${u.name}`)).toEqual(expected);
    expect(expected).toEqual(['class:K', 'method:m', 'function:<anon>']);
  });
});
