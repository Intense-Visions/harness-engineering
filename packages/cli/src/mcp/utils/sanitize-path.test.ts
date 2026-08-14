import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { sanitizePath } from './sanitize-path';

/**
 * Characterization coverage for `sanitizePath` — the security-relevant path
 * guard that every MCP graph tool runs its `path` input through.
 *
 * These tests pin the CURRENT behavior as-is (they do not assert a hardened
 * ideal): the function resolves the input to an absolute path and rejects only
 * the filesystem root. Traversal, symlinks, and out-of-project escapes are NOT
 * rejected today; the tests below document that stance so a future change is a
 * deliberate, visible edit rather than a silent one.
 */
describe('sanitizePath', () => {
  it('resolves a relative path against the current working directory', () => {
    expect(sanitizePath('some/project')).toBe(path.resolve('some/project'));
  });

  it('returns an already-absolute path unchanged (idempotent under re-resolution)', () => {
    const abs = path.resolve('/tmp/harness-project');
    expect(sanitizePath(abs)).toBe(abs);
  });

  it('normalizes redundant `.` and `..` segments', () => {
    expect(sanitizePath('/tmp/a/./b/../c')).toBe(path.resolve('/tmp/a/c'));
  });

  it('throws for the literal filesystem root', () => {
    expect(() => sanitizePath('/')).toThrow('cannot use filesystem root');
  });

  it('throws when traversal resolves up to the filesystem root', () => {
    // `/foo/..` collapses to `/`, which the guard rejects.
    expect(() => sanitizePath('/foo/..')).toThrow('Invalid project path');
  });

  it('does NOT reject a normal absolute path just below root (characterizes the narrow guard)', () => {
    // Only root itself is rejected — a first-level directory is allowed even
    // though it grants broad access. This documents the current (narrow) scope.
    expect(sanitizePath('/foo')).toBe(path.resolve('/foo'));
  });

  it('does NOT reject out-of-project traversal that stays above root', () => {
    // `../../../etc` resolves somewhere under the fs but not to root, so it is
    // accepted as-is today. Pinned to make any future hardening explicit.
    const result = sanitizePath('../../../etc');
    expect(result).toBe(path.resolve('../../../etc'));
    expect(path.isAbsolute(result)).toBe(true);
  });
});
