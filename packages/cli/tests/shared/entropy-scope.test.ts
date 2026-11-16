import { describe, it, expect } from 'vitest';
import { docsDirGlob } from '../../src/shared/entropy-scope';

// PR #2549: the docsDir fallback must be a forward-slash glob. A
// backslash-separated one matches nothing under `glob` (backslash = escape),
// which zeroed the drift denominator on Windows CI.
describe('docsDirGlob', () => {
  it('turns a win32 docs directory into a forward-slash glob', () => {
    // MUTATION: build it with `path.join` and this keeps the backslashes on win32.
    expect(docsDirGlob('C:\\repo\\docs')).toBe('C:/repo/docs/**/*.md');
  });

  it('leaves a posix directory as-is and drops a trailing separator', () => {
    expect(docsDirGlob('/repo/docs')).toBe('/repo/docs/**/*.md');
    expect(docsDirGlob('C:\\repo\\docs\\')).toBe('C:/repo/docs/**/*.md');
  });
});
