# Workflow audit: `.github/workflows/smoke-test.yml`

Pipeline: `harness-workflow-audit` (Phases 1-4), scoped to a single workflow file.
Base: `main` @ `2bae0ab812968c461272f269c9b586918b5c5b94`. Date: 2026-09-24.

> Per this skill's gate **"Do not modify workflow files"**, this audit produced the
> findings and patches below and changed nothing. Applying WA-001 is a separate,
> separately-authorized act — see the commit that follows this one.

---

## Summary block

```
WORKFLOW AUDIT: harness-engineering (scoped: .github/workflows/smoke-test.yml)
Workflows audited: 1 (of 22 parsed for the scope cross-check)   Findings: 1 error, 1 warning, 1 info
Gates that never fire: smoke-test.yml :: job `smoke` (dies at step 1 of 6; no gated
  assertion has executed since 2026-09-23)
Documented-but-unwired gates: none
```

---

## Phase 1 — INVENTORY

| Property                   | Value                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| File                       | `.github/workflows/smoke-test.yml` (94 lines)                                                |
| Workflow name              | `Post-Publish Smoke Test`                                                                    |
| Trigger                    | `workflow_run`, `workflows: [Release]`, `types: [completed]`, `branches: [main]`             |
| Jobs                       | 1 — `smoke` (`ubuntu-latest`), gated `if: github.event.workflow_run.conclusion == 'success'` |
| Steps                      | 6 (pre-patch)                                                                                |
| `permissions:`             | **absent** at both workflow and job level                                                    |
| `concurrency:`             | absent                                                                                       |
| `paths:` / `paths-ignore:` | none present                                                                                 |
| Action refs                | `actions/setup-node@v6` (only action in the file)                                            |
| `secrets.*` references     | none (`grep -n 'secrets\.'` → 0 matches)                                                     |
| `${{ }}` expressions       | exactly 1, at line 18, inside an `if:`                                                       |

Trigger resolution: `workflows: [Release]` resolves to `.github/workflows/release.yml`,
whose line 1 is `name: Release`. The trigger is live, not stale.

Documented gate this workflow claims to enforce (from its own header comment, lines 8-14,
and cross-referenced in `scripts/check-changesets.mjs` lines 5-14): after every successful
publish, import all eight published `@harness-engineering/*` packages and exercise a CLI
command that walks the orchestrator dependency chain, so that an incident-#332-style
cross-package module-load mismatch fails the release.

File-tree snapshot for Phase 2: `git ls-files .nvmrc` → `.nvmrc` (tracked, content `22`).

---

## Phase 2 — MECHANICAL

### [ERROR] WA-001 `nvmrc-without-checkout` (M6 dead/stale reference) — `.github/workflows/smoke-test.yml:21-23`

**Observation.** The job's first step is `actions/setup-node@v6` with
`node-version-file: .nvmrc`. The `smoke` job has **no `actions/checkout` step** — deliberately,
because it installs the _published_ packages from npm and must not test the working tree.
`node-version-file` is resolved against the runner workspace, which is therefore empty.

Observed failure, run `35909041364` (head `2bae0ab8`, the pinned base tip):

```
2026-09-23T19:23:59.0103745Z   node-version-file: .nvmrc
2026-09-23T19:23:59.1773367Z ##[error]The specified node version file at:
  /home/runner/work/harness-engineering/harness-engineering/.nvmrc does not exist
```

**Introduced by.** `0d9970743` ("ci: read the Node version from .nvmrc instead of 26
hardcoded copies", 2026-09-23 11:53 -0400). Verified by diff, not by subject:

```
diff --git a/.github/workflows/smoke-test.yml b/.github/workflows/smoke-test.yml
@@ -20,7 +20,7 @@ jobs:
      - uses: actions/setup-node@v6
        with:
-          node-version: 22
+          node-version-file: .nvmrc
```

That sweep was correct for the other 25 jobs; all of them check out the repo first.

**Regression window** (`gh run list --workflow smoke-test.yml`):

| Run         | Head       | Created              | Conclusion           |
| ----------- | ---------- | -------------------- | -------------------- |
| 35638970226 | `a4977922` | 2026-09-21T18:31:51Z | success (last green) |
| 35894178583 | `4ef72cb8` | 2026-09-23T17:13:56Z | skipped              |
| 35894361421 | `4ef72cb8` | 2026-09-23T17:15:32Z | **failure**          |
| 35895032443 | `4ef72cb8` | 2026-09-23T17:21:26Z | **failure**          |
| 35909041364 | `2bae0ab8` | 2026-09-23T19:23:54Z | **failure**          |

**Effect.** The job dies at step 1 of 6 (the fleet SELECT brief said "step 1 of 8"; the
pre-patch job has 6 steps — corrected here from the file). It never installs the CLI, never runs
`harness --version` or `harness --help`, and never performs the eight-package import probe.
The gate this workflow exists to be — the one guarding against incident #332 shipping to
npm — has asserted **nothing** on any release since 2026-09-23. It is green-adjacent noise:
a red check that looks like a flaky post-publish job rather than a disabled gate.

**Patch** (insert before the `setup-node` step; `actions/checkout@v6` matches the repo
convention — 26 of 26 checkout references in `.github/workflows/` are `@v6`, and the repo
SHA-pins nothing):

```diff
     steps:
+      # This job deliberately has no full checkout: it tests the PUBLISHED packages
+      # from npm, not the working tree. But `node-version-file` below resolves against
+      # the runner workspace, so the one file it does need must be fetched. Sparse,
+      # non-cone so a bare filename matches, and nothing else lands in the workspace.
+      - uses: actions/checkout@v6
+        with:
+          sparse-checkout: .nvmrc
+          sparse-checkout-cone-mode: false
+
       - uses: actions/setup-node@v6
         with:
           node-version-file: .nvmrc
```

**Alternative rejected by the human at the fleet CONFIRM gate:** reverting to a literal
`node-version: 22`. It fixes the red but reintroduces the 27th uncoupled copy of the pin
that `0d9970743` existed to eliminate.

---

### [WARNING] WA-002 `permissions-absent` (M2.1) — `.github/workflows/smoke-test.yml:1-19`

**Observation.** No `permissions:` block at workflow or job level, so the job inherits the
repository default. That default is verified write, not read:

```
$ gh api repos/:owner/:repo/actions/permissions/workflow
{"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}
```

Every step in the job is read-only with respect to the repository: `sleep`,
`npm install -g`, `harness --version`, `harness --help`, and an `npm init` + `npm install` +
dynamic-`import` probe in `/tmp/smoke`. Nothing pushes, comments, tags, or releases. The
job therefore holds a `contents: write` token it has no use for — and once WA-001 lands, a
persisted checkout credential alongside it.

**Patch** (the minimal grant derived from what the steps actually do):

```diff
 jobs:
   smoke:
     if: ${{ github.event.workflow_run.conclusion == 'success' }}
     runs-on: ubuntu-latest
+    permissions:
+      contents: read
     steps:
```

**NOT APPLIED.** This finding was surfaced by the audit but was not part of the batch the
human approved at the CONFIRM gate. Reported for a follow-up decision.

---

### M1 / M3 / M4 / M5 — resolved, no finding

- **M1 path-filter correctness — N/A, verified.** The file contains no `paths:` or
  `paths-ignore:` filters (`grep` → 0 matches). Its only trigger filters are
  `workflows: [Release]` (resolves to `release.yml`, `name: Release`) and `branches: [main]`
  (the default branch). No glob to go stale, so the Iron Law's signature failure mode is
  absent here — the gate is dead for a different reason (WA-001), not a dead filter.
- **M3 action pinning.** `actions/setup-node@v6` is first-party (`actions/*`) on a mutable
  major tag, which is this repo's uniform convention: 27 `setup-node@v6` and 26
  `checkout@v6` references, zero SHA pins anywhere in `.github/workflows/`. Not a floating
  branch (`@main`/`@master`), so M3.1 does not apply and M3.2's "inconsistent with the
  repo's own convention" test passes. The WA-001 patch matches this convention exactly.
- **M4 self-trigger and concurrency.** The job runs no `git push`, writes no commit, and
  produces no artifact committed back to a branch, so M4.1-M4.4 do not apply. On M4.5: no
  `concurrency:` group, but overlapping runs cannot race — each run installs a global CLI
  and an `npm init` scratch project inside its own ephemeral runner, sharing no mutable
  state, and the upstream `Release` workflow is already serialized
  (`cancel-in-progress: false`). No finding.
- **M5 secret handling.** The file references no `secrets.*` at all (0 grep matches), so
  there is nothing to echo or pass on a command line. No finding.

---

## Phase 3 — JUDGMENT

_(Run in full. Phase 2 was not clean, and would not have licensed skipping this even if it were.)_

### [INFO] WA-003 `workflow-run-ref-semantics` — `.github/workflows/smoke-test.yml:21-27` (post-patch)

On a `workflow_run` event, `actions/checkout` with no `ref:` checks out the default
branch's tip, which can be one or two commits ahead of the commit the triggering `Release`
published (`release.yml`'s "Promote golden build reference state" step pushes to `main`
after publishing). The alternative would be `ref: ${{ github.event.workflow_run.head_sha }}`.

**Deliberately not added.** This job's contract is to test what is on _npm_, not a tree
state, and the only thing it needs from the repository is the current Node pin. `main`'s
tip `.nvmrc` _is_ the current pin, and is the correct one to run the probe under. Pinning
to `head_sha` would be defensible but is a second decision, not part of the approved shape.
Recorded so the choice is visible rather than implicit.

### J1 Script injection — no finding

The file contains exactly one `${{ }}` expression, at line 18:
`if: ${{ github.event.workflow_run.conclusion == 'success' }}`. It is a comparison inside
an `if:` condition, never interpolated into a `run:` script, and `workflow_run.conclusion`
is a GitHub-generated enum rather than an attacker-supplied string. No `github.event.*`,
`github.head_ref`, PR title, branch name, or comment body reaches any `run:` block. The
trigger is `workflow_run`, not `pull_request_target`, so J1.3 does not apply.

### J2 Gate completeness — subsumed by WA-001

The gate is documented (this file's own header comment, lines 8-14; `scripts/check-changesets.mjs`
lines 5-14) **and** wired — the eight-package import probe at lines 40-93 is real,
substantive, and correct. It is not missing; it is unreachable. Counting it a second time as
a separate "gate-missing" finding would double-report WA-001.

### J3 Ratchet and severity calibration — N/A

The workflow contains no ratchet, baseline, or ledger gate. Nothing is committed back, so
J3.3's cross-reference to M4.4 does not arise.

### J4 Fork-PR degradation — N/A

The only trigger is `workflow_run` off `Release` on `main`. The workflow never runs on a
`pull_request` event, so there is no fork-PR path and no read-only-`GITHUB_TOKEN` degradation
to handle.

---

## Phase 4 — RANKED FINDINGS

| Rank | Severity | ID                                  | Location               | Status                                     |
| ---- | -------- | ----------------------------------- | ---------------------- | ------------------------------------------ |
| 1    | ERROR    | WA-001 `nvmrc-without-checkout`     | `smoke-test.yml:21-23` | **Patch applied** (separately authorized)  |
| 2    | WARNING  | WA-002 `permissions-absent`         | `smoke-test.yml:1-19`  | Reported only — outside the approved batch |
| 3    | INFO     | WA-003 `workflow-run-ref-semantics` | `smoke-test.yml:21-27` | Reasoned non-change, recorded              |

### Scope cross-check

WA-001 could have been a class rather than an instance. It is not. A per-job scan of all
22 workflow files (parsed with `yaml`; 0 parse failures) found 26 jobs using
`node-version-file` and exactly **one** with no `actions/checkout`:

```
workflow files parsed: 22
parse failures: (none)
jobs using node-version-file: 26
JOBS with node-version-file and NO actions/checkout:
  - smoke-test.yml :: job smoke
```

The remediation is correctly scoped to this one job.

---

## Escalation (per this skill's "dead gate" rule)

The gate has been dead since 2026-09-23 — short in wall-clock terms, but it spans every
publish in that window, and this is precisely the gate whose absence let incident #332
reach npm. Re-arming a dead gate usually surfaces a backlog, so:

**This fix cannot be proven green in-run.** `Post-Publish Smoke Test` triggers on
`workflow_run` after `Release` completes; it does not run on pull requests. Its next real
execution is after the next publish. The PR's own CI proves the change breaks nothing; it
cannot prove the smoke job now passes.

Recommended follow-up, before trusting the next release's green: run the eight-package
import probe once by hand against the currently-published packages, so the first
post-merge execution is not also the first time anyone has checked what it finds.
