import { describe, it, expect } from 'vitest';
import { parse } from '@typescript-eslint/typescript-estree';
import { normalizeTokens, fingerprintStream } from '../../src/duplication/tokens';

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
