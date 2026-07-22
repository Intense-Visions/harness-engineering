/**
 * Doc-coverage gate — block a local/codex change that adds a new public source file
 * without documenting it.
 *
 * Motivation: the enforced local gate ran only `typecheck + lint + test`, so the
 * autopilot's definition of "done" was narrower than a real ship. A new ESLint rule
 * (or any new public module) would pass verify yet fail the repo's own doc-drift check
 * in real CI — the harness counts a source file documented only if a `docs/` markdown
 * references its basename ([[doc-coverage-is-link-based]]). This gate closes that gap:
 * it fails when a NEWLY-ADDED source file is not referenced anywhere under `docs/`, so
 * the reasoner→coder loop is forced to produce the docs a real merge requires.
 *
 * Scope is deliberately conservative to avoid false positives:
 *  - Only ADDED files (a modification to an existing file keeps its prior doc status).
 *  - Only real source under a package `src/` — never tests, type-only decls, barrels,
 *    or config (those are not the public surface a reader looks up).
 *  - "Documented" = the basename (sans extension) appears ANYWHERE under `docs/` (a
 *    mention, not only a strict link) — lenient by design, since rules/APIs are
 *    referenced by name, and a false BLOCK is worse than a lenient pass here.
 */

/** Does this added file represent public surface that warrants a doc reference? */
export function needsDoc(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  if (!/(^|\/)packages\/[^/]+\/src\//.test(p)) return false;
  if (!/\.(ts|tsx|js|jsx)$/.test(p)) return false;
  if (/\.(test|spec)\.[jt]sx?$/.test(p)) return false;
  if (/\.d\.ts$/.test(p)) return false;
  const base = p.slice(p.lastIndexOf('/') + 1);
  if (base === 'index.ts' || base === 'index.js') return false; // barrels re-export; not surface
  if (/\.(config|types)\.[jt]sx?$/.test(base) || base === 'types.ts') return false;
  return true;
}

/** Basename without its extension — the token a doc reference uses (e.g. a rule name). */
export function docToken(relPath: string): string {
  const base = relPath.slice(relPath.replace(/\\/g, '/').lastIndexOf('/') + 1);
  return base.replace(/\.[^.]+$/, '');
}

/**
 * Given the added files and the concatenated text of every `docs/` markdown, return the
 * added source files whose basename is NOT mentioned in the docs (i.e. undocumented).
 * Pure — the orchestrator's runner supplies the file list + docs text via IO seams.
 */
export function findUndocumentedAdditions(
  addedFiles: readonly string[],
  docsText: string
): string[] {
  const undocumented: string[] = [];
  for (const file of addedFiles) {
    if (!needsDoc(file)) continue;
    const token = docToken(file);
    if (token === '') continue;
    if (!docsText.includes(token)) undocumented.push(file);
  }
  return undocumented;
}

/** Human-readable gate reason for undocumented additions. */
export function formatUndocumentedReason(undocumented: readonly string[]): string {
  const list = undocumented.map((f) => `  - ${f}`).join('\n');
  return (
    `doc coverage failed: ${undocumented.length} new source file(s) are not referenced under docs/.\n` +
    `${list}\n` +
    `Document each — add it to the matching docs/ reference (e.g. a new ESLint rule goes in ` +
    `docs/reference/eslint-rules.md and the package README, updating any rule/feature count) ` +
    `so the change is ship-ready and passes the repo's doc-drift check.`
  );
}
