import { describe, it, expect } from 'vitest';
import { computeSourceHash } from '../../src/comprehension/source-hash';
import type { SourceFile } from '../../src/comprehension/types';

const files: SourceFile[] = [
  { path: 'a.ts', content: 'export const a = 1;' },
  { path: 'b.ts', content: 'export const b = 2;' },
];

describe('computeSourceHash', () => {
  it('returns a 64-char lowercase hex sha256', () => {
    const h = computeSourceHash(files);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent (same set, any order ⇒ same hash)', () => {
    expect(computeSourceHash(files)).toBe(computeSourceHash([...files].reverse()));
  });

  it('changes when a member file content changes', () => {
    const changed = [{ ...files[0], content: 'export const a = 999;' }, files[1]];
    expect(computeSourceHash(changed)).not.toBe(computeSourceHash(files));
  });

  it('changes when a file is ADDED to the membership set', () => {
    const added = [...files, { path: 'c.ts', content: 'export const c = 3;' }];
    expect(computeSourceHash(added)).not.toBe(computeSourceHash(files));
  });

  it('changes when a file is REMOVED from the membership set', () => {
    expect(computeSourceHash([files[0]])).not.toBe(computeSourceHash(files));
  });

  it('distinguishes a content moved between files (length-prefixed boundaries)', () => {
    const a = [
      { path: 'x.ts', content: 'ab' },
      { path: 'y.ts', content: 'c' },
    ];
    const b = [
      { path: 'x.ts', content: 'a' },
      { path: 'y.ts', content: 'bc' },
    ];
    expect(computeSourceHash(a)).not.toBe(computeSourceHash(b));
  });
});
