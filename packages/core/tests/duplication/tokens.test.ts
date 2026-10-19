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
