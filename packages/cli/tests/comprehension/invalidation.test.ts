import { describe, it, expect } from 'vitest';
import { filesToModules } from '../../src/comprehension/invalidation';

describe('filesToModules (SC3 — changed files → owning module directories)', () => {
  it('maps changed files to sorted, de-duplicated owning directories', () => {
    expect(filesToModules(['pkg/a/x.ts', 'pkg/a/y.ts', 'pkg/b/z.ts'])).toEqual(['pkg/a', 'pkg/b']);
  });

  it('drops root-level files (no owning directory) and non-source extensions', () => {
    expect(filesToModules(['README.md', 'pkg/a/data.json', 'pkg/a/x.ts'])).toEqual(['pkg/a']);
  });

  it('returns the owning directory for a supported file', () => {
    expect(filesToModules(['pkg/a/x.ts'])).toEqual(['pkg/a']);
  });

  it('normalizes Windows-style separators to posix', () => {
    expect(filesToModules(['pkg\\a\\x.ts'])).toEqual(['pkg/a']);
  });

  it('SC3 shape: result equals { dirname(f) : f in S, supported(f) } — never repo-wide', () => {
    const changed = ['a/b/one.ts', 'a/b/two.ts', 'c/three.tsx', 'top.ts', 'a/b/notes.md'];
    const result = filesToModules(changed);
    // exactly the owning dirs of the supported, non-root files
    expect(result).toEqual(['a/b', 'c']);
    // never the whole repo: 'top.ts' (root) is excluded, 'notes.md' (non-source) is excluded
    expect(result).not.toContain('');
    expect(result).not.toContain('.');
  });

  it('honors a custom extension set', () => {
    expect(filesToModules(['pkg/a/x.py', 'pkg/b/y.ts'], ['.py'])).toEqual(['pkg/a']);
  });
});
