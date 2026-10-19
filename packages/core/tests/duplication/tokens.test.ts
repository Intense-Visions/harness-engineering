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
