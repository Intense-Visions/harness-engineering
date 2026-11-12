// THE PROPERTY: one path→scope rule, and it answers "no directory" for a path
// that has none.
//
// Stated before the encoding because the encoding is what went wrong. Three
// copies of this rule shipped: `scopeOfPath` (review) and `craftScope` (craft)
// were BYTE-IDENTICAL, and `issueScope` (intake) was the same rule minus the
// `cut === -1` guard — so it answered `'README.m/'` for `README.md`, because
// `slice(0, -1)` drops the last character rather than meaning "no directory".
//
// Three copies is how the third copy got to be different. There is one now, and
// the `-1` case is the first thing it is asked.

import { describe, expect, it } from 'vitest';

import { scopeOfPath } from './scope';

describe('scopeOfPath', () => {
  it('is the directory of the path', () => {
    expect(scopeOfPath('packages/cli/src/a.ts')).toBe('packages/cli/src');
    expect(scopeOfPath('src/auth/login.ts')).toBe('src/auth');
  });

  it("answers '.' for a path with NO directory — the case the third copy got wrong", () => {
    // `lastIndexOf` returns -1, and `slice(0, -1)` is "all but the last
    // character": the unguarded form answered `'README.m'` here, which is a
    // plausible-looking directory that does not exist.
    expect(scopeOfPath('README.md')).toBe('.');
    expect(scopeOfPath('')).toBe('.');
    expect(scopeOfPath('a')).toBe('.');
    // POSITIVE CONTROL at the same scope: one character further in and there IS
    // a directory, so this is a guard on the boundary and not a function that
    // answers '.' for everything.
    expect(scopeOfPath('/README.md')).toBe('');
    expect(scopeOfPath('x/README.md')).toBe('x');
  });

  it('does NOT split on a backslash — win32 and POSIX must agree', () => {
    // `path.dirname` on win32 answers `a\b` here while POSIX leaves the string
    // whole, so the same item would hash into two different clump ids across
    // the CI matrix. A backslash is a name character to this rule.
    expect(scopeOfPath('a\\b\\c.ts')).toBe('.');
    expect(scopeOfPath('a/b\\c.ts')).toBe('a');
  });

  it('keeps a trailing separator out of the answer', () => {
    // A directory path handed in by mistake scopes to its PARENT rather than to
    // itself, which is the same rule applied consistently, not a special case.
    expect(scopeOfPath('packages/cli/')).toBe('packages/cli');
  });
});
