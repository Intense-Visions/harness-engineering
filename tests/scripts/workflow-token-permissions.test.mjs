/**
 * Regression test for workflow GITHUB_TOKEN over-privilege.
 *
 * GitHub resolves a job's token scopes in a fixed order: a job-level
 * `permissions:` beats a workflow-level `permissions:`, which beats the
 * REPOSITORY DEFAULT. A job that declares neither therefore does not run
 * unscoped — it runs with whatever the repository default happens to be, and
 * this repository's default is verifiably `write`:
 *
 *   $ gh api repos/:owner/:repo/actions/permissions/workflow
 *   {"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}
 *
 * At the base of this test six jobs across five files declared no `permissions:`
 * at either level — benchmark.yml `bench`, ci.yml `changeset-check`, ci.yml
 * `build-and-test`, harness.yml `harness`, openapi-drift-check.yml
 * `drift-check`, and smoke-test.yml `smoke` — so each ran with a write-scoped
 * token that step inspection shows none of them ever uses. The worst of them,
 * smoke-test.yml `smoke`, runs on `workflow_run` (always evaluated in the
 * default-branch context, with the full token) and `npm install -g`s then
 * imports eight freshly published packages: third-party code executing on a
 * runner that is holding a write-scoped repository token.
 *
 * Sixteen other workflow files ALREADY declared `permissions: contents: read`,
 * so the convention existed — what was missing was any mechanism to enforce it.
 * That is the root cause this test addresses, and it is why the assertion below
 * is a CLASS-LEVEL INVARIANT over the whole directory rather than six named
 * checks: a newly added workflow that forgets the block fails this test too,
 * which six hardcoded assertions would never have caught.
 *
 * The invariant checks the VALUE, not merely the presence, of each scope. An
 * existence check alone is satisfiable by `permissions: write-all`, and it
 * ratchets in one direction only — it would pin the two writers against being
 * narrowed while letting any of the six newly scoped readers be widened back to
 * `write` in silence, which is the exact regression this file exists to stop.
 * So every job must be `contents: read` unless it appears in the WRITERS
 * allowlist below with its scopes spelled out.
 *
 * Note what this test can and cannot prove. It proves every job DECLARES a
 * least-authority scope. It cannot prove least authority at RUNTIME — the
 * property is the absence of a write these jobs never attempt, and an absence
 * emits no signal. The control here is asserted by construction, not
 * demonstrated by a runtime denial.
 *
 * Sibling of workflow-merge-race.test.mjs and baseline-gating.test.mjs, which
 * likewise assert over workflow YAML because the defect lives in the YAML, not
 * in a script. ci.yml's "Baseline-gating regression test" step globs this
 * directory, so a sibling file is CI-wired with no workflow change.
 *
 * Run with: node --test tests/scripts/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const workflowDir = fileURLToPath(new URL('../../.github/workflows/', import.meta.url));

/** Every workflow file in the directory, parsed, sorted for stable output. */
function readWorkflows() {
  return readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => ({ name, doc: parseYaml(readFileSync(join(workflowDir, name), 'utf8')) }));
}

test('the workflow directory is non-empty (guards a silently vacuous sweep)', () => {
  // Without this, a bad glob or a moved directory would make every assertion
  // below pass over zero files — green, and proving nothing.
  assert.ok(readWorkflows().length > 0, '.github/workflows/ must contain workflow files');
});

/**
 * The jobs that genuinely need more than read, with the exact scopes they need.
 * Everything NOT listed here must be `contents: read`. Adding an entry is the
 * deliberate, reviewable act of granting authority; that is the point of an
 * allowlist over a bare existence check.
 */
const WRITERS = new Map([
  ['ci.yml:refresh-baselines', { contents: 'write', 'pull-requests': 'write' }],
  ['ci.yml:comprehension-refresh', { contents: 'write', 'pull-requests': 'write' }],
  ['docker.yml:build-and-push', { contents: 'read', packages: 'write' }],
  ['docker.yml:smoke-test', { contents: 'read', packages: 'write' }],
  ['holiday-confidence-track.yml:track', { contents: 'write', 'pull-requests': 'write' }],
  ['main-health.yml:main-health', { actions: 'read', contents: 'read', issues: 'write' }],
  ['main-health.yml:e2e-nightly', { actions: 'read', contents: 'read', issues: 'write' }],
  [
    'release.yml:ci-gate',
    { contents: 'write', 'pull-requests': 'write', 'id-token': 'write', packages: 'write' },
  ],
  [
    'release.yml:release',
    { contents: 'write', 'pull-requests': 'write', 'id-token': 'write', packages: 'write' },
  ],
  ['release.yml:docker', { contents: 'read', packages: 'write' }],
  ['required-review.yml:required-review', { contents: 'read', 'pull-requests': 'write' }],
  [
    'roadmap-auto-done.yml:auto-done',
    { contents: 'write', issues: 'read', 'pull-requests': 'write' },
  ],
  ['rollback-propose.yml:sweep', { contents: 'read', 'pull-requests': 'write' }],
  ['snapshot.yml:snapshot', { contents: 'write', 'pull-requests': 'write' }],
]);

const READ_ONLY = { contents: 'read' };

/** A job's effective scopes: job-level beats workflow-level, exactly as GitHub resolves them. */
function effectivePermissions(doc, job) {
  return job?.permissions ?? doc?.permissions;
}

test('every workflow job holds exactly the authority it needs, and no more', () => {
  const violations = [];

  for (const { name, doc } of readWorkflows()) {
    for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
      const id = `${name}:${jobId}`;
      const actual = effectivePermissions(doc, job);
      const expected = WRITERS.get(id) ?? READ_ONLY;

      if (actual === undefined) {
        // No declaration at either level => the job inherits the REPOSITORY
        // default, which is `write` on every scope. This is the original defect.
        violations.push(`${id}: no \`permissions:\` at job or workflow level (inherits \`write\`)`);
        continue;
      }
      // Deliberately compares the VALUE. A shorthand string (`write-all`,
      // `read-all`) is not deep-equal to the mapping form and fails here on
      // purpose: scopes should be spelled out one key at a time.
      try {
        assert.deepEqual(actual, expected);
      } catch {
        violations.push(
          `${id}: has ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        );
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `workflow token authority drifted from least-privilege. Every job must be ` +
      `\`contents: read\` unless it is in the WRITERS allowlist in this file with the ` +
      `exact scopes it needs. If a job legitimately began writing, add it to WRITERS ` +
      `in the same change — do not widen it silently:\n  ${violations.join('\n  ')}`
  );
});
