# Workflow Audit: the Release `docker` job never starts on a real publish

**Date:** 2026-08-09 · **Skill:** `harness-workflow-audit` · **Scope:** `.github/workflows/release.yml`, `.github/workflows/docker.yml`
**Failing evidence:** Release run `31323256027` (head `7536404cf72bdee394a1f338886b0c303809977f`, 2026-08-09T16:14:16Z)

## Summary

```text
WORKFLOW AUDIT: harness-engineering (scoped to release.yml + docker.yml)
Workflows audited: 2   Findings: 1 error, 2 warning, 1 info
Gates that never fire: docker.yml container publish (never executed once in repo history)
Documented-but-unwired gates: none
```

The container-publish gate is the Iron Law case this skill exists for: a gate that looks
correct, is wired up, and has never enforced anything. `docker.yml` has produced zero
container images since it was chained from `release.yml`, and the organisation's container
registry is empty.

## Phase 1 — Inventory

`release.yml`

- Trigger: `push` on `main`. No path filters.
- Concurrency: group `${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: false`.
- Jobs: `ci-gate`, `release`, `docker` (the last calls `./.github/workflows/docker.yml`).

`docker.yml`

- Triggers: `push` on tags `@harness-engineering/*`, `workflow_dispatch`, `workflow_call`.
- Concurrency: group `${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: false`.
- Jobs: `build-and-push` (4-way matrix), `smoke-test`.

## Phase 2 — Mechanical checks

| Check                         | Result                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 path filters               | No `paths:` / `paths-ignore:` in either file. The tag glob `@harness-engineering/*` matches 352 tracked tags — live, not stale.                                                                     |
| M2 permission scoping         | The `docker` job carries a correctly narrowed job-level grant (`contents: read`, `packages: write`). No over-grant found.                                                                           |
| M3 action pinning             | Third-party actions are on mutable major tags (`docker/build-push-action@v6`, `changesets/action@v1`, `pnpm/action-setup@v5`). Consistent with repo-wide convention. Informational only.            |
| M4 self-trigger + concurrency | **ERROR — see finding below.** The `release` job's push-back to `main` is correctly guarded with `[skip ci]`.                                                                                       |
| M5 secret handling            | No secret is echoed. `GITHUB_TOKEN` is consumed via `with:`, not on a command line.                                                                                                                 |
| M6 dead references            | All resolve: `./.github/workflows/docker.yml`, `scripts/docker-smoke-test.sh`, `scripts/assert-diff-scope.mjs`, and all four Dockerfile targets (`cli`, `mcp-server`, `orchestrator`, `dashboard`). |

## Phase 3 — Judgment checks

- **J1 injection** — `docker.yml` interpolates `${{ inputs.version }}` directly into a `run:`
  script. Under `workflow_call` the value is repo-internal; under `workflow_dispatch` it is
  operator-supplied. Low severity, reported below, deliberately **not** fixed here to keep this
  change single-purpose.
- **J2 gate completeness** — the container-publish gate is wired but has never fired. See the
  escalation note.
- **J3 ratchet calibration** — not applicable to these two workflows.
- **J4 fork-PR degradation** — not applicable; `release.yml` runs only on push to `main`.

## Phase 4 — Findings

### [ERROR] concurrency-deadlock — `.github/workflows/docker.yml:17`

Under `workflow_call`, `${{ github.workflow }}` resolves to the **caller's** workflow name, so
the called workflow's concurrency group evaluates to `Release-refs/heads/main` — the exact group
the still-in-flight caller `Release` run already holds, with `cancel-in-progress: false`. A
called workflow that demands a concurrency group held by its own caller can never start, and
GitHub's deadlock detection terminates the run rather than queueing it forever.

Effect: on every real publish the `docker` job is never created, the run is marked `failure`
even though every job in it succeeded, and no container image is ever built or pushed.

Patch:

```diff
 concurrency:
-  group: ${{ github.workflow }}-${{ github.ref }}
+  # NOTE: do NOT use ${{ github.workflow }} here. Under `workflow_call` it resolves to the
+  # CALLER's workflow name (Release), which collides with the caller's own in-flight
+  # concurrency group and deadlocks the call so the job is never created.
+  group: docker-${{ github.ref }}
   cancel-in-progress: false
```

### [WARNING] gate-never-fired — `.github/workflows/docker.yml`

The container-publish gate has produced zero images across the repository's entire history. The
organisation container registry (`orgs/Intense-Visions/packages?package_type=container`) returns
empty. Until a real publish exercises the fixed path, "green CI" says nothing about whether
container publishing works.

Requires human decision: whether to backfill images for already-published versions. Explicitly
out of scope for this change.

### [WARNING] shell-interpolation — `.github/workflows/docker.yml:57`

`VERSION="${{ inputs.version }}"` interpolates a workflow input straight into a shell script.
Routing it through `env:` would make it data rather than code.

Requires human decision: fold into a follow-up change; deliberately excluded here so this fix
stays reviewable as a single-cause remediation.

### [INFO] action-pinning — both files

Third-party actions ride mutable major tags. SHA pinning is the stronger form. Repo-wide
convention, not specific to this defect.

## Escalation (per skill: long-dead gate)

This gate has been dead since it was introduced — not merely stale. Per the skill's escalation
rule, re-arming a long-dead gate usually surfaces a backlog of real findings, so the fix should
not be assumed sufficient on merge alone. The recommended follow-up is one controlled,
human-authorised exercise of the publish path. **That exercise is not performed as part of this
change**, because `docker.yml` builds with `push: true` and a `latest` tag, so any dispatch
publishes real images to the org registry. That decision belongs to a human.
