/**
 * Regression tests for the `gh pr merge --auto` merge race at the call sites
 * PR #2048 did not reach.
 *
 * #2048 diagnosed the defect in ci.yml's `refresh-baselines` job: this repo has
 * NO `required_status_checks` branch rule (ruleset 14799222 carries only
 * `deletion`, `non_fast_forward`, and `pull_request` with one required approval),
 * and that one approval is satisfied inline by the PAT on the line immediately
 * above the merge. `gh pr merge --auto` only QUEUES when something is still
 * pending, so with nothing left to wait on it attempts an IMMEDIATE merge; when
 * the base advances in between, the mutation is rejected with
 *
 *   GraphQL: Base branch was modified. Review and try the merge again.
 *   (mergePullRequest)
 *
 * and the step exits non-zero under `bash -e`, reddening the default branch for a
 * race that loses no work at all. #2048 fixed ci.yml only. Two structurally
 * identical call sites survived:
 *
 *   - .github/workflows/release.yml         (golden-build reference promotion)
 *   - .github/workflows/roadmap-auto-done.yml (roadmap auto-done flip)
 *
 * These assert the ported remediation over the workflow TEXT — the same reason
 * tests/scripts/baseline-gating.test.mjs asserts over ci.yml's text: the defect
 * lives in the YAML, not in a script.
 *
 * This is a SIBLING of baseline-gating.test.mjs rather than an addition to it:
 * that file is documented end to end as the #671 baseline-jitter/refresh-race
 * suite, and neither of these workflows touches a baseline. `node --test
 * 'tests/scripts/*.test.mjs'` (ci.yml's "Baseline-gating regression test" step)
 * globs the directory, so a sibling file is CI-wired with no workflow change.
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Slice one workflow step's text, from its `- name:` line to `end`. */
function stepText(workflow, stepName, end) {
  const yml = readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), 'utf8');
  const start = yml.indexOf(`- name: ${stepName}`);
  assert.ok(start !== -1, `${workflow} must still carry the "${stepName}" step`);
  if (end === undefined) return yml.slice(start);
  const stop = yml.indexOf(end, start);
  assert.ok(stop !== -1, `the "${stepName}" step must still be followed by ${JSON.stringify(end)}`);
  return yml.slice(start, stop);
}

const goldenPromoteStep = stepText(
  'release.yml',
  'Promote golden build reference state',
  '\n  docker:'
);
const autoDoneStep = stepText('roadmap-auto-done.yml', 'Commit and push the shard flip');

/**
 * Both steps already contained an unrelated `for attempt in 1 2 3` loop around
 * their DIRECT PUSH before this fix, so "a bounded loop exists somewhere in the
 * step" proves nothing. Every assertion below is anchored to the merge call
 * itself.
 */
const RETRIED_MERGE =
  /for attempt in 1 2 3; do\n\s*if gh pr merge "\$PR_URL" --auto --squash --delete-branch; then/;
const BARE_MERGE = /^[ \t]*gh pr merge "\$PR_URL" --auto --squash --delete-branch[ \t]*$/m;
const SILENCED_MERGE = /gh pr merge[^\n]*\|\|\s*true/;

for (const [label, step] of [
  ['release/golden-promote', goldenPromoteStep],
  ['roadmap-auto-done', autoDoneStep],
]) {
  test(`${label}: the auto-merge call sits inside a bounded retry that re-derives`, () => {
    assert.match(
      step,
      RETRIED_MERGE,
      'the merge must be attempted inside the bounded retry, not once and bare'
    );
    assert.doesNotMatch(
      step,
      BARE_MERGE,
      'no unguarded `gh pr merge --auto` may remain — that is the exact #2048 defect'
    );
    assert.match(
      step,
      /rebuild_branch_on_base/,
      'each retry must re-derive the branch on the fresh base tip, not blindly repeat'
    );
    assert.match(
      step,
      /git push --force-with-lease -u origin "\$BRANCH"/,
      'the re-derived branch must be force-pushed to the SAME PR, never open a second one'
    );
  });

  test(`${label}: retry exhaustion abstains visibly and exits clean`, () => {
    // Deliberately UNLIKE ci.yml, which CLOSES its superseded baseline PR: that is
    // correct only because a stale baseline PR is actively dangerous under the
    // `merge=ours` driver and the next merge regenerates one. Neither payload here
    // regenerates itself, so closing would silently drop unique work.
    assert.match(step, /abstain_open\(\) \{/, 'exhaustion must route through a named abstain');
    assert.match(step, /::warning::/, 'the abstain must be announced in the run log, not silent');
    assert.match(
      step,
      /\n\s*exit 0\n\s*\}/,
      'the abstain path must exit 0 — a lost merge race is not a failed job'
    );
    assert.match(
      step,
      /\n\s*abstain_open "3 merge attempts exhausted"/,
      'the loop must fall through to the abstain, never off the end of the step'
    );
    // Scope this to the abstain FUNCTION BODY: the retry loop legitimately closes
    // the PR in the one case where the base provably already carries the payload,
    // so a step-wide `gh pr close` search would be vacuous.
    const abstainBody = step.match(/abstain_open\(\) \{([\s\S]*?)\n {10}\}/);
    assert.ok(abstainBody, 'abstain_open must be a named function with a readable body');
    assert.doesNotMatch(
      abstainBody[1],
      /gh pr close/,
      'the abstain must LEAVE THE PR OPEN — closing would discard work nothing regenerates'
    );
  });

  test(`${label}: the merge is not neutralised and the scope guard gates every approval`, () => {
    assert.doesNotMatch(
      step,
      SILENCED_MERGE,
      'the merge must never be silenced with `|| true` — that hides a real failure'
    );
    assert.match(
      step,
      /approve_pr\(\) \{[\s\S]*?assert-diff-scope\.mjs/,
      'the fail-closed self-approval scope guard must live inside the re-runnable approval'
    );
    assert.ok(
      (step.match(/^\s*approve_pr\s*$/gm) ?? []).length >= 2,
      'approve_pr must be called again after every force-push — a force-push can dismiss ' +
        'the inline approval applied to the previous head'
    );
  });
}

test('roadmap-auto-done: the re-derive re-runs the reconciler, never a wholesale snapshot copy', () => {
  // The load-bearing difference from ci.yml. Baselines are regenerated wholesale,
  // so re-applying "ours" onto a newer tip is always the correct resolution. The
  // roadmap is a shared, additively-edited shard tree: copying our snapshot of
  // docs/roadmap.d/ onto a newer base would REVERT any row another commit flipped
  // in between. `roadmap reconcile --from-refs` is pure, offline and idempotent,
  // so re-running it yields the same logical mutation and touches nothing else.
  assert.match(
    autoDoneStep,
    /roadmap reconcile --from-refs "\$REFS"/,
    'the re-derive must re-run the reconciler against the fresh base'
  );
  assert.doesNotMatch(
    autoDoneStep,
    /^\s*git checkout "\$OURS" -- \$ROADMAP_PATHS\s*$/m,
    'the PR branch must never be built by copying our roadmap snapshot over a newer base'
  );
  assert.match(
    autoDoneStep,
    /CLOSING_REFS: \$\{\{ steps\.closing\.outputs\.refs \}\}/,
    'the closing refs must reach the script as env DATA, not interpolated into it'
  );
});

test('release/golden-promote: the re-derive is a wholesale manifest re-apply', () => {
  // Safe here precisely because ci.yml's property genuinely holds: the manifest is
  // written wholesale by `golden-build promote`, and this step is its only writer
  // (serialized by the Release concurrency group), so re-applying "ours" can
  // neither conflict nor revert a concurrent writer.
  assert.match(
    goldenPromoteStep,
    /rebuild_branch_on_base\(\) \{[\s\S]*?git checkout "\$OURS" -- "\$MANIFEST"/,
    'the golden manifest re-derive must re-apply our wholesale snapshot on the fresh tip'
  );
});
