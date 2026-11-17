/**
 * Regression test for #2047: the changesets release PR never shows a CI signal.
 *
 * release.yml's `changesets/action` creates and force-updates the
 * `changeset-release/main` PR with the default GITHUB_TOKEN. GitHub's rule for
 * events caused by that token (docs: "When GITHUB_TOKEN triggers workflow
 * runs"):
 *
 *   - `pull_request` opened/synchronize/reopened create runs in an
 *     APPROVAL-REQUIRED state — they sit in `action_required` until a human
 *     clicks "Approve workflows to run". Observed: every run on #2494's head
 *     SHAs was `action_required`, and `statusCheckRollup` was empty, so the PR
 *     that PUBLISHES the packages displayed no signal at all.
 *   - `workflow_dispatch` and `repository_dispatch` ALWAYS create runs.
 *
 * So the fix needs no new secret and no repository-settings change: after the
 * action opens/updates the PR, release.yml dispatches CI and Harness Checks
 * against the release branch. A `workflow_dispatch` run's GITHUB_SHA is the tip
 * of the dispatched branch — the PR's head commit — so its check runs attach to
 * that commit and appear on the PR.
 *
 * What this test pins (the defect lives in workflow YAML, so it asserts over it):
 *   1. ci.yml and harness.yml accept `workflow_dispatch` (else the dispatch 422s).
 *   2. release.yml exposes `hasChangesets` from the action and a job that, on
 *      exactly that condition, dispatches both workflows at the release branch,
 *      holding `actions: write` (required by the dispatch API) and nothing more.
 *   3. Under the new event, concurrency still behaves: push stays per-COMMIT and
 *      never cancelled; PR and dispatch are per-REF and supersede themselves.
 *   4. No step that dereferences `github.event.pull_request.*` can run under a
 *      dispatch, where that payload is absent (it would expand to empty and, e.g.,
 *      `git fetch origin ` would fetch the wrong thing or fail).
 *
 * It cannot prove GitHub renders the dispatched checks on the PR — that is a
 * platform behaviour, observable only on the next release PR after merge.
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

function load(name) {
  const text = readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
  return { text, doc: parseYaml(text) };
}

/** YAML 1.1 parsers read a bare `on:` key as boolean true; the `yaml` package does not, but be safe. */
function triggers(doc) {
  return doc.on ?? doc[true];
}

const ci = load('ci.yml');
const harness = load('harness.yml');
const release = load('release.yml');

/** The workflows the release PR must get a signal from, by file and display name. */
const DISPATCHED = [
  ['ci.yml', ci],
  ['harness.yml', harness],
];

for (const [name, wf] of DISPATCHED) {
  test(`${name} accepts workflow_dispatch so release.yml can run it on the release branch`, () => {
    const on = triggers(wf.doc);
    assert.ok(on && typeof on === 'object', `${name} must declare its triggers as a mapping`);
    assert.ok(
      Object.prototype.hasOwnProperty.call(on, 'workflow_dispatch'),
      `${name} must declare \`workflow_dispatch\` — without it \`gh workflow run ${name}\` is rejected (HTTP 422)`
    );
    // The existing triggers must survive untouched.
    assert.deepEqual(on.push, { branches: ['main'] });
    assert.deepEqual(on.pull_request, { branches: ['main'] });
  });

  test(`${name} concurrency: push per-commit uncancelled, PR and dispatch per-ref superseding`, () => {
    const { group, 'cancel-in-progress': cancel } = wf.doc.concurrency;
    // The `A && B || C` idiom: B must be truthy (a SHA is) for it to select B.
    assert.match(
      group,
      /\$\{\{ github\.event_name == 'push' && github\.sha \|\| github\.ref \}\}$/,
      `${name}: the group must key a push by its SHA and every other event by its ref`
    );
    assert.equal(
      cancel,
      "${{ github.event_name != 'push' }}",
      `${name}: only push runs must be immune to cancellation`
    );
  });

  test(`${name}: every github.event.pull_request reference is guarded to the pull_request event`, () => {
    const unguarded = [];
    for (const [jobId, job] of Object.entries(wf.doc.jobs ?? {})) {
      const jobGuard = String(job.if ?? '').includes("github.event_name == 'pull_request'");
      for (const [i, step] of (job.steps ?? []).entries()) {
        const body = JSON.stringify(step);
        if (!body.includes('github.event.pull_request')) continue;
        const stepGuard = String(step.if ?? '').includes("github.event_name == 'pull_request'");
        if (!jobGuard && !stepGuard)
          unguarded.push(`${jobId} step ${i} (${step.name ?? step.run})`);
      }
    }
    assert.deepEqual(unguarded, [], `${name}: these steps would run with an empty PR payload`);
  });
}

test('release.yml exposes the action’s hasChangesets output from the release job', () => {
  const outputs = release.doc.jobs.release.outputs ?? {};
  assert.equal(outputs['has-changesets'], '${{ steps.changesets.outputs.hasChangesets }}');
});

test('release.yml dispatches CI and Harness Checks at the release branch after opening/updating the PR', () => {
  const entries = Object.entries(release.doc.jobs).filter(([, job]) => {
    const needs = [job.needs ?? []].flat();
    return needs.includes('release') && JSON.stringify(job.steps ?? []).includes('gh workflow run');
  });
  assert.equal(
    entries.length,
    1,
    'exactly one release.yml job must dispatch the release-PR checks'
  );
  const [jobId, job] = entries[0];

  // Runs exactly when changesets/action took its version branch (opened or
  // updated the PR) — it publishes only when there are NO changesets.
  assert.equal(
    job.if,
    "needs.release.outputs.has-changesets == 'true'",
    `${jobId} must be gated on the action having opened/updated the release PR`
  );
  // The dispatch API requires actions: write; nothing else is needed.
  assert.deepEqual(job.permissions, { actions: 'write', contents: 'read' });

  const script = job.steps.map((s) => s.run ?? '').join('\n');
  for (const file of ['ci.yml', 'harness.yml']) {
    assert.match(
      script,
      new RegExp(`gh workflow run ${file.replace('.', '\\.')} [^\\n]*--ref "\\$RELEASE_BRANCH"`),
      `${jobId} must dispatch ${file} at the release branch`
    );
  }
  const env = Object.assign({}, job.env, ...job.steps.map((s) => s.env ?? {}));
  assert.equal(env.RELEASE_BRANCH, 'changeset-release/${{ github.ref_name }}');
  assert.equal(
    env.GH_TOKEN,
    '${{ secrets.GITHUB_TOKEN }}',
    'no new secret: the default token suffices'
  );
});
