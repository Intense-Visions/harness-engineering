// Pure scope-check for the refresh-baselines self-approval step in ci.yml.
//
// The refresh job self-approves its own PR with BASELINE_AUTOAPPROVE_PAT when
// branch protection blocks a direct push. That approval must fire ONLY when the
// PR diff is confined to the known baseline files — otherwise a compromised or
// buggy run could self-approve arbitrary changes to main. This module holds the
// decision so it can be unit-tested; the workflow passes the allowlist in from
// its own $BASELINE_FILES so there is a single source of truth.
//
// The allowlist is an EXACT path set, not a glob: two of the files are bare
// `baselines.json` (`.harness/arch/…`, `packages/cli/.harness/arch/…`), which a
// `*-baselines.json` pattern would wrongly exclude. This is the exact-match case
// of the shared `assertDiffScope` guard.
import { assertDiffScope } from './diff-scope-guard.mjs';

/**
 * @param {string[]} changedFiles paths from `gh pr diff --name-only`
 * @param {string[]} allowlist the exact permitted paths (the job's $BASELINE_FILES)
 * @returns {{ ok: boolean, offending: string[], changed: string[] }}
 *   ok is true iff at least one file changed AND every changed path is allowlisted.
 *   An empty diff is treated as NOT ok — a phantom/empty diff must never auto-approve.
 */
export function assertBaselineOnly(changedFiles, allowlist) {
  // Baseline paths never end in `/`, so this is pure exact matching.
  return assertDiffScope(changedFiles, allowlist);
}
