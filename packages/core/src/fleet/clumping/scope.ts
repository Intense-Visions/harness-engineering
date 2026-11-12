// packages/core/src/fleet/clumping/scope.ts
//
// The ONE path→scope rule the clumping control uses, at every seam.
//
// It lived in three places: `scopeOfPath` (review/output/clump-comments.ts),
// `craftScope` (cli shared/craft/findings/clumpable.ts) — byte-identical
// bodies — and `issueScope` (cli commands/fleet/clumpable-issues.ts), which was
// the same rule MINUS the `cut === -1` guard and therefore wrong:
// `issueScope(['README.md'])` answered `'README.m/'`, because `slice(0, -1)`
// drops the last character instead of meaning "no directory". Unreachable in
// production — the intake seam's PATH_PATTERN requires a slash — but exported
// with a signature advertising no such precondition.
//
// Three copies of one rule is how the third copy got to be different, so the
// rule lives here and the seams' sentinel and trailing-slash conventions are
// thin wrappers over it.

/**
 * The directory a path sits in, or `'.'` when it sits at the root.
 *
 * Split on `/` explicitly rather than `node:path.dirname`, and that is the
 * load-bearing part. Every seam feeds this POSIX, project-relative paths — the
 * review seam from the diff, the craft seam from `craftPath`, the intake seam
 * from issue text — and `path.dirname` on win32 ADDITIONALLY splits on `\`. The
 * scope is hashed into the published clump id, so a platform-sensitive split
 * would hand the same finding a different id on a Windows CI leg than on a
 * Linux one, and success criterion 7 (determinism) would hold on each machine
 * while failing between them — the only place the id is actually exchanged.
 *
 * A backslash is therefore a NAME CHARACTER here: `a\b\c.ts` has no `/`, so it
 * is a root-level file called `a\b\c.ts` and its scope is `'.'`, identically on
 * every platform.
 */
export function scopeOfPath(file: string): string {
  const cut = file.lastIndexOf('/');
  return cut === -1 ? '.' : file.slice(0, cut);
}
