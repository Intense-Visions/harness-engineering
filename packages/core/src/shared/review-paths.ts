/**
 * Review path rules shared by the receipt gate and the review tier selector. A leaf: it imports
 * nothing, so importing it adds no dependency depth to either module.
 */

/** Project-relative POSIX form, so a path written on win32 compares equal to git's output. */
export function normalizeReviewPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * The one path-escape rule: a path meant to be relative to a root leaves it when it is absolute,
 * drive-qualified or holds a `..` segment. `..name` is a file name, not an escape.
 */
export function pathEscapes(relative: string): boolean {
  const p = relative.replace(/\\/g, '/');
  return p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..');
}
