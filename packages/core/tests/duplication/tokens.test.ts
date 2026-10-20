import { describe, it, expect } from 'vitest';
import { parse } from '@typescript-eslint/typescript-estree';
import {
  normalizeTokens,
  fingerprintStream,
  IDENTIFIER_PLACEHOLDER,
  LITERAL_PLACEHOLDER,
} from '../../src/duplication/tokens';
import { extractUnits } from '../../src/duplication/units';

function tokensOf(src: string) {
  return parse(src, { tokens: true, loc: true, range: true }).tokens ?? [];
}

describe('normalizeTokens', () => {
  it('maps identifiers to I and literals to L, keeping keywords and punctuators verbatim', () => {
    const src = `const abc = 'x' + 1;`;
    const stream = normalizeTokens(tokensOf(src), [0, src.length]);
    expect(stream.join(' ')).toBe('const I = L + L ;');
  });

  it('maps private identifiers to I', () => {
    const src = `class K { #p = 1; }`;
    const stream = normalizeTokens(tokensOf(src), [0, src.length]);
    expect(stream.join(' ')).toBe('class I { I = L ; }');
  });

  it('maps template literals and regular expressions to L', () => {
    const src = 'const t = `a`; const r = /x/;';
    const stream = normalizeTokens(tokensOf(src), [0, src.length]);
    expect(stream).toContain('L');
    expect(stream.join(' ')).toBe('const I = L ; const I = L ;');
  });

  it('keeps boolean and null tokens verbatim (keyword-like, not literals)', () => {
    const src = `const a = true; const b = null;`;
    const stream = normalizeTokens(tokensOf(src), [0, src.length]);
    expect(stream.join(' ')).toBe('const I = true ; const I = null ;');
  });

  it('selects only tokens fully inside the given range', () => {
    const src = `const outside = 1;\nfunction inner() { return 2; }`;
    const fnStart = src.indexOf('function');
    const stream = normalizeTokens(tokensOf(src), [fnStart, src.length]);
    expect(stream.join(' ')).toBe('function I ( ) { return L ; }');
  });
});

describe('normalizeTokens — JSX (D1)', () => {
  const jsxTokens = (src: string) =>
    parse(src, { tokens: true, loc: true, range: true, jsx: true }).tokens ?? [];
  const jsxFingerprint = (src: string) =>
    fingerprintStream(normalizeTokens(jsxTokens(src), [0, src.length]));

  it('keeps element and attribute names verbatim while collapsing JSX text', () => {
    const src = `const A = () => <div className="x">hi</div>;`;
    expect(normalizeTokens(jsxTokens(src), [0, src.length]).join(' ')).toBe(
      'const I = ( ) => < div className = L > L < / div > ;'
    );
  });

  it('fingerprints different elements differently — a tag name is structural, not a rename', () => {
    // Collapsing JSXIdentifier to I made these two share 213c70b88dc1f373:
    // `<input>` versus `<button>` is different behavior, not a renaming.
    expect(jsxFingerprint(`const A = () => <div className="x">hi</div>;`)).not.toBe(
      jsxFingerprint(`const B = () => <span className="x">hi</span>;`)
    );
    expect(jsxFingerprint(`const A = () => <input value="x" />;`)).not.toBe(
      jsxFingerprint(`const B = () => <button value="x" />;`)
    );
  });

  it('fingerprints different attribute names differently', () => {
    expect(jsxFingerprint(`const A = () => <div className="x">hi</div>;`)).not.toBe(
      jsxFingerprint(`const B = () => <div onClick="x">hi</div>;`)
    );
  });

  it('collapses JSX text and attribute string values to L', () => {
    const a = jsxFingerprint(`const A = () => <div className="x">hi</div>;`);
    expect(jsxFingerprint(`const B = () => <div className="x">bye</div>;`)).toBe(a);
    expect(jsxFingerprint(`const C = () => <div className="y">hi</div>;`)).toBe(a);
  });

  it('still collapses an identifier inside an expression container', () => {
    // JSXIdentifier covers element and attribute names only; a referenced
    // variable is a plain Identifier token and must still normalize.
    expect(jsxFingerprint(`const A = ({ userName }) => <div id={userName}>hi</div>;`)).toBe(
      jsxFingerprint(`const B = ({ other }) => <div id={other}>hi</div>;`)
    );
  });
});

describe('fingerprintStream', () => {
  it('is a 16-character lowercase hex digest', () => {
    expect(fingerprintStream(['const', 'I', '=', 'L', ';'])).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same stream and differs for a different one', () => {
    const a = fingerprintStream(['const', 'I']);
    expect(fingerprintStream(['const', 'I'])).toBe(a);
    expect(fingerprintStream(['let', 'I'])).not.toBe(a);
  });

  it('separates tokens so concatenation cannot alias', () => {
    expect(fingerprintStream(['ab', 'c'])).not.toBe(fingerprintStream(['a', 'bc']));
  });
});

describe('D1 Type-2 equivalence (verified substrate)', () => {
  const shape = (fn: string, p: string, acc: string, el: string) =>
    `export function ${fn}(${p}: { cost: number; label: string }[]) {\n` +
    `  let ${acc} = 0;\n` +
    `  const seen: string[] = [];\n` +
    `  for (const ${el} of ${p}) {\n` +
    `    if (${el}.cost > 0) {\n` +
    `      ${acc} += ${el}.cost;\n` +
    `      seen.push(${el}.label);\n` +
    `    }\n` +
    `  }\n` +
    `  return { total: ${acc}, labels: seen };\n` +
    `}\n`;

  function fingerprintSource(src: string): string {
    const ast = parse(src, { tokens: true, loc: true, range: true });
    return fingerprintStream(normalizeTokens(ast.tokens ?? [], [0, src.length]));
  }

  it('assigns the same fingerprint to functions differing only in names', () => {
    expect(fingerprintSource(shape('addBeta', 'rows', 'acc', 'row'))).toBe(
      fingerprintSource(shape('sumAlpha', 'items', 'total', 'item'))
    );
  });

  it('is insensitive to whitespace and comments', () => {
    const plain = shape('sumAlpha', 'items', 'total', 'item');
    const decorated = `// a leading comment\n${plain.replace(/\n/g, '\n\n')}`;
    expect(fingerprintSource(decorated)).toBe(fingerprintSource(plain));
  });

  it('is sensitive to a changed operator — not merely a name hash', () => {
    const changed = shape('sumAlpha', 'items', 'total', 'item').replace('> 0', '>= 0');
    expect(fingerprintSource(changed)).not.toBe(
      fingerprintSource(shape('sumAlpha', 'items', 'total', 'item'))
    );
  });

  it('is sensitive to a changed keyword', () => {
    const changed = shape('sumAlpha', 'items', 'total', 'item').replace('let total', 'var total');
    expect(fingerprintSource(changed)).not.toBe(
      fingerprintSource(shape('sumAlpha', 'items', 'total', 'item'))
    );
  });
});

/**
 * The token types the normalizer collapses to `L`. Spelled out here rather
 * than imported so the oracle below is an INDEPENDENT statement of the
 * contract: importing the production set would make the test agree with the
 * implementation by construction.
 */
const ORACLE_LITERAL_TYPES = ['String', 'Numeric', 'Template', 'RegularExpression', 'JSXText'];

function oracleNormalize(
  tokens: readonly { type: string; value: string; range: readonly [number, number] }[],
  range: readonly [number, number]
): string[] {
  const [start, end] = range;
  return tokens
    .filter((t) => t.range[0] >= start && t.range[1] <= end)
    .map((t) => {
      if (t.type === 'Identifier' || t.type === 'PrivateIdentifier') return IDENTIFIER_PLACEHOLDER;
      if (ORACLE_LITERAL_TYPES.includes(t.type)) return LITERAL_PLACEHOLDER;
      return t.value;
    });
}

describe('normalizeTokens range selection', () => {
  it('selects exactly the tokens fully inside the range, in source order', () => {
    // A hand-checked oracle independent of the implementation: filter the same
    // token array by the same predicate the contract states. Nested units are
    // the load-bearing part — the outer unit's range strictly contains the
    // inner one's, so a range lookup that stops at the first non-matching
    // token would diverge here.
    const source = [
      'export function outer(alpha: number): number {',
      '  const beta = alpha + 1;',
      '  function inner(gamma: number): number {',
      '    return gamma * 2;',
      '  }',
      '  return inner(beta);',
      '}',
    ].join('\n');
    const program = parse(source, { tokens: true, loc: true, range: true });
    const tokens = program.tokens ?? [];
    const units = extractUnits(program);
    expect(units.length).toBeGreaterThan(1);
    for (const unit of units) {
      expect(normalizeTokens(tokens, unit.range)).toEqual(oracleNormalize(tokens, unit.range));
    }
  });

  it('returns an empty stream for a range that contains no whole token', () => {
    const program = parse('const a = 1;', { tokens: true, loc: true, range: true });
    expect(normalizeTokens(program.tokens ?? [], [1, 2])).toEqual([]);
  });

  it('returns the whole file for a range spanning it', () => {
    const source = 'export function f(a: number): number {\n  return a + 1;\n}\n';
    const program = parse(source, { tokens: true, loc: true, range: true });
    const tokens = program.tokens ?? [];
    expect(normalizeTokens(tokens, [0, source.length])).toHaveLength(tokens.length);
  });

  it('returns an empty stream for an empty token array', () => {
    // The degenerate input the binary search has to survive: `lo` and `hi`
    // both start at 0, the loop never runs. A file whose parse yields no
    // tokens reaches this via `program.tokens ?? []`.
    expect(normalizeTokens([], [0, 100])).toEqual([]);
  });

  it('returns an empty stream for a zero-width range', () => {
    const program = parse('const a = 1;', { tokens: true, loc: true, range: true });
    const tokens = program.tokens ?? [];
    expect(tokens.length).toBeGreaterThan(0);
    // `start === end`, which only a zero-width token could satisfy — and this
    // parser emits none (see tokens.ts). Pinned so the `>` / `>=` break
    // boundary has a recorded behavior rather than an assumed one.
    expect(normalizeTokens(tokens, [6, 6])).toEqual([]);
    expect(normalizeTokens(tokens, [6, 6])).toEqual(oracleNormalize(tokens, [6, 6]));
  });

  it('returns exactly one token for a range spanning exactly that token', () => {
    const program = parse('const alpha = 1;', { tokens: true, loc: true, range: true });
    const tokens = program.tokens ?? [];
    const target = tokens.find((t) => t.type === 'Identifier');
    expect(target).toBeDefined();
    // Both boundaries inclusive, on the same token: the tightest non-empty
    // range there is, and the one the binary search is most likely to land
    // off-by-one on.
    const exact: [number, number] = [target!.range[0], target!.range[1]];
    expect(normalizeTokens(tokens, exact)).toEqual([IDENTIFIER_PLACEHOLDER]);
    expect(normalizeTokens(tokens, exact)).toEqual(oracleNormalize(tokens, exact));
  });

  it('agrees with the oracle for a range cut mid-token', () => {
    // What this asserts: the documented predicate holds when the range ends
    // INSIDE a token — the template is excluded, the `const`/`a`/`=` before it
    // are not — matched against the independent oracle.
    //
    // What it does NOT assert, despite an earlier name and comment here that
    // claimed it: that the walk uses `continue` rather than `break` on
    // `range[1] > end`. It cannot. This parser's tokens are non-overlapping
    // and sorted (measured: 0 overlaps over 1,605,827 tokens in the 2,153
    // files the detector scans), so no token after a mid-cut one can be fully
    // inside the range, and the `break` mutant passes this case and the whole
    // suite. See `duplication/tokens.ts` for why `continue` is kept anyway.
    // Fabricating a discriminating case would require a token array this
    // parser cannot produce.
    const source = 'const a = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`; const b = 1;';
    const program = parse(source, { tokens: true, loc: true, range: true });
    const tokens = program.tokens ?? [];
    const template = tokens.find((t) => t.type === 'Template');
    expect(template).toBeDefined();
    // A range ending mid-template: the template is excluded, `const`/`a`/`=`
    // before it are not.
    const cut: [number, number] = [0, template!.range[0] + 5];
    const stream = normalizeTokens(tokens, cut);
    expect(stream).toEqual(oracleNormalize(tokens, cut));
    expect(stream).toEqual(['const', IDENTIFIER_PLACEHOLDER, '=']);
  });

  it('agrees with the oracle over every unit of every nesting shape in a dense file', () => {
    // Breadth, not depth: classes, methods, arrows, object methods, nested
    // closures and an IIFE, so the equivalence property covers the unit shapes
    // `extractUnits` actually emits rather than one hand-picked case.
    const source = [
      'export class Holder {',
      '  private total = 0;',
      '  add(value: number): number {',
      '    const scaled = value * 2;',
      '    const apply = (extra: number) => {',
      '      const inner = () => extra + scaled;',
      '      return inner() + this.total;',
      '    };',
      '    return apply(1);',
      '  }',
      '  static make(): Holder {',
      '    return new Holder();',
      '  }',
      '}',
      'export const bag = {',
      '  run(items: readonly number[]): number {',
      '    return items.map((item) => item + 1).reduce((carry, next) => carry + next, 0);',
      '  },',
      '};',
      'export const boot = (() => {',
      '  function helper(flag: boolean): string {',
      "    return flag ? 'yes' : 'no';",
      '  }',
      '  return helper;',
      '})();',
    ].join('\n');
    const program = parse(source, { tokens: true, loc: true, range: true });
    const tokens = program.tokens ?? [];
    const units = extractUnits(program);
    // Pin the denominator: an empty `units` would make the loop below a
    // vacuous pass.
    expect(units.length).toBeGreaterThanOrEqual(8);
    for (const unit of units) {
      expect(normalizeTokens(tokens, unit.range)).toEqual(oracleNormalize(tokens, unit.range));
    }
  });
});
