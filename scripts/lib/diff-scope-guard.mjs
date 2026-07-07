// Pure scope-check shared by the CI self-approval steps in ci.yml (baseline
// refresh) and roadmap-auto-done.yml (roadmap flip). Both self-approve a PR with
// BASELINE_AUTOAPPROVE_PAT when branch protection blocks a direct push; that
// approval must fire ONLY when the PR diff stays inside a known set of paths, so
// the PAT can never be leveraged to self-approve arbitrary changes to main.
//
// `allowed` entries:
//   - ending in `/`  → directory prefix (matches that dir and anything under it),
//     e.g. `docs/roadmap.d/` matches `docs/roadmap.d/foo.md`.
//   - otherwise       → exact path match, e.g. `coverage-baselines.json`.
// An exact allowlist (no trailing slashes) is deliberately NOT a glob: files like
// `baselines.json` would be excluded by a `*-baselines.json` pattern.

/**
 * @param {string[]} changedFiles paths from `gh pr diff --name-only`
 * @param {string[]} allowed permitted exact paths and/or `dir/` prefixes
 * @returns {{ ok: boolean, offending: string[], changed: string[] }}
 *   ok is true iff at least one file changed AND every changed path is allowed.
 *   An empty diff is NOT ok — a phantom/empty diff must never auto-approve.
 */
export function assertDiffScope(changedFiles, allowed) {
  const changed = changedFiles.map((f) => f.trim()).filter(Boolean);
  const patterns = allowed.map((p) => p.trim()).filter(Boolean);
  const isAllowed = (f) =>
    patterns.some((p) => (p.endsWith('/') ? f === p.slice(0, -1) || f.startsWith(p) : f === p));
  const offending = changed.filter((f) => !isAllowed(f));
  const ok = changed.length > 0 && offending.length === 0;
  return { ok, offending, changed };
}
