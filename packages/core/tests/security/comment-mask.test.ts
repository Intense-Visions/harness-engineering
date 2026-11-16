import { describe, it, expect } from 'vitest';
import { maskComments, supportsCommentMasking } from '../../src/security/comment-mask';

describe('maskComments', () => {
  it('blanks a line comment and preserves column positions', () => {
    const [out] = maskComments(['const a = 1; // note']);
    expect(out).toBe('const a = 1;        ');
    expect(out).toHaveLength('const a = 1; // note'.length);
  });

  it('blanks a block comment spanning lines and resumes code after it', () => {
    expect(maskComments(['x(); /* a', ' * b', ' */ y();'])).toEqual([
      'x();     ',
      '    ',
      '    y();',
    ]);
  });

  it('keeps // and /* inside strings, templates and regex literals', () => {
    const lines = [
      "const a = 'https://x/*y';",
      'const b = "//";',
      'const c = `//${f({ k: "/*" })}//`;',
      'const d = /\\/\\/[/*]/g;',
    ];
    expect(maskComments(lines)).toEqual(lines);
  });

  it('masks a comment that follows a template interpolation', () => {
    expect(maskComments(['const c = `${a}`; // tail'])).toEqual(['const c = `${a}`;        ']);
  });

  it('treats a slash after an identifier as division, not a regex', () => {
    expect(maskComments(['const r = a / b; // half'])).toEqual(['const r = a / b;        ']);
  });

  it('does not let an unterminated quote leak into the next line', () => {
    expect(maskComments(["const s = 'oops", '// next'])).toEqual(["const s = 'oops", '       ']);
  });
});

/**
 * A mis-lexed slash or quote flips string parity, and the lexer then reads a
 * `//` INSIDE a string as a comment opener — blanking the real code after it.
 * Every case below hid an `eval(input)` before the fix; each is paired with a
 * control proving the trailing comment on that same construct is still masked.
 */
describe('maskComments — code after a slash ambiguity is never blanked', () => {
  const masks = (src: string): string[] => maskComments(src.split('\n'));

  it('treats a slash after postfix ++ / -- as division', () => {
    for (const op of ['++', '--']) {
      const line = `n = i${op} / 2; u = 'a/b//c'; eval(input);`;
      expect(masks(line)).toEqual([line]);
    }
  });

  it('masks a real trailing comment after a postfix ++ division', () => {
    expect(masks('n = i++ / 2; // half')).toEqual(['n = i++ / 2;        ']);
  });

  it('treats a slash after a property or identifier named like a keyword as division', () => {
    for (const operand of ['obj.in', '$in', 'x.return']) {
      const line = `x = ${operand} / 2; u = 'a/b//c'; eval(input);`;
      expect(masks(line)).toEqual([line]);
    }
  });

  it('control: a slash after the real `in` / `return` keyword still opens a regex', () => {
    expect(masks("return /'/.test(s) && f('//'); eval(input);")).toEqual([
      "return /'/.test(s) && f('//'); eval(input);",
    ]);
  });

  it('treats a slash after an if / while / for header as a regex', () => {
    for (const kw of ['if', 'while', 'for']) {
      const line = `${kw} (ok) /'/.test(s) && u('//'); eval(input);`;
      expect(masks(line)).toEqual([line]);
    }
  });

  it('control: a slash after any other closing paren still divides', () => {
    expect(masks('x = f(a) / 2; // half')).toEqual(['x = f(a) / 2;        ']);
    expect(masks('x = g(f(a)) / 2; // half')).toEqual(['x = g(f(a)) / 2;        ']);
  });

  it('carries a quoted string across a backslash line continuation', () => {
    expect(masks("const s = 'abc\\\n//x'; eval(input);")).toEqual([
      "const s = 'abc\\",
      "//x'; eval(input);",
    ]);
  });

  it('control: an escaped backslash at end of line does not continue the string', () => {
    expect(masks("const s = 'a\\\\'; f(\n// next")).toEqual(["const s = 'a\\\\'; f(", '       ']);
  });
});

describe('supportsCommentMasking', () => {
  it('covers JS/TS/Go and nothing else', () => {
    for (const f of ['a.ts', 'a.tsx', 'a.js', 'a.mjs', 'a.cjs', 'a.mts', 'a.jsx', 'a.go']) {
      expect(supportsCommentMasking(f)).toBe(true);
    }
    for (const f of ['a.py', 'a.yaml', 'a.md', 'a.json', '.mcp.json', 'Dockerfile']) {
      expect(supportsCommentMasking(f)).toBe(false);
    }
  });
});
