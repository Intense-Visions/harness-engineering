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
