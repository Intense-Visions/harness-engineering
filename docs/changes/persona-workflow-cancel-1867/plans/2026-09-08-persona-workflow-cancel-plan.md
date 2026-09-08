# Plan — persona CI workflows cancel main's own verification (#1867)

- **Date:** 2026-09-08
- **Issue:** #1867
- **Precedent:** #1865 — `fix(ci): stop merge bursts from cancelling main's verification` (merge commit `93bc0788f`)
- **Pipeline:** `harness-workflow-audit` (inventory → mechanical → judgment → report), then remediation
- **Base SHA:** `db9c6739da57f6dd38a2e9d83bf94a1bfce9ca7b`
- **Branch:** `cicd/persona-workflow-cancel-1867`

---

## 1. Audit findings

`harness-workflow-audit` run scoped to `.github/workflows/persona-*.yml` (7 files) and their
generator `packages/cli/src/persona/generators/ci-workflow.ts`.

```
WORKFLOW AUDIT: harness-engineering (scope: persona-*.yml + generator)
Workflows audited: 7   Findings: 2 error, 1 info
Gates that never fire: persona-architecture-enforcer.yml (pull_request, dead path filter)
Documented-but-unwired gates: none in scope
```

### [ERROR] concurrency-cancels-trunk-verification — generator `ci-workflow.ts:202` (this change)

All 7 generated workflows carry:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Four of the seven also trigger on `push:` to `main`:

| generated workflow                     | `push`                  | `pull_request` | `schedule` | affected by the push defect |
| -------------------------------------- | ----------------------- | -------------- | ---------- | --------------------------- |
| `persona-architecture-enforcer.yml`    | yes (`main`, `develop`) | yes            | yes        | **yes**                     |
| `persona-documentation-maintainer.yml` | yes (`main`)            | yes            | no         | **yes**                     |
| `persona-graph-maintainer.yml`         | yes (`main`)            | no             | yes        | **yes**                     |
| `persona-task-executor.yml`            | yes (`main`, `develop`) | yes            | no         | **yes**                     |
| `persona-codebase-health-analyst.yml`  | no                      | yes            | yes        | no                          |
| `persona-entropy-cleaner.yml`          | no                      | no             | yes        | no                          |
| `persona-performance-guardian.yml`     | no                      | yes            | yes        | no                          |

On a push, `github.ref` is `refs/heads/main` for **every** commit, so all main pushes share one
concurrency group and each new merge cancels the still-running verification of the previous
commit. The run concludes `cancelled`, not `failure`, so nothing alarms — the verification is
destroyed silently.

**Live evidence at the pinned base.** On the `75eade4ee` main push, three persona runs were
cancelled when `2f1e5bd04` landed four minutes later:

| workflow                 | run id        | conclusion  |
| ------------------------ | ------------- | ----------- |
| Documentation Maintainer | `34239670105` | `cancelled` |
| Graph Maintainer         | `34239670102` | `cancelled` |
| Task Executor            | `34239670064` | `cancelled` |

**The repo already documents the symptom.** `scripts/main-health-check.mjs:32` — _"`cancel-in-progress: true`,
so rapid merges leave a trail of cancelled runs"_ — and `DECISIVE_CONCLUSIONS` excludes
`cancelled` to work around it.

**Root cause is the generator, not the files.** The seven `.yml` files are generated and guarded
by `pnpm generate:persona-workflows:check` in CI. #1865 fixed the same defect in the hand-written
`ci.yml` / `harness.yml` but explicitly deferred the generated set (#1865 body, follow-up 1:
_"Same concurrency defect in the 4 generated persona workflows → fix via their generator"_).
#1867 is that follow-up.

### [ERROR] path-filter-dead — `persona-architecture-enforcer.yml:14` (OUT OF SCOPE — filed as follow-up)

`paths: src/**` resolves to **0 tracked files** (`git ls-files src/` → 0; there is no top-level
`src/` in this repo — code lives under `packages/*/src/`). The `pull_request` trigger for
Architecture Enforcer has therefore **never fired**. Three sibling workflows carry the same dead
glob but survive because a second glob matches:

| workflow                               | globs                          | live?                  |
| -------------------------------------- | ------------------------------ | ---------------------- |
| `persona-architecture-enforcer.yml`    | `src/**`                       | **dead — 0 matches**   |
| `persona-documentation-maintainer.yml` | `src/**`, `docs/**` (2082)     | live via `docs/**`     |
| `persona-performance-guardian.yml`     | `src/**`, `packages/**` (4332) | live via `packages/**` |
| `persona-task-executor.yml`            | `src/**`, `packages/**` (4332) | live via `packages/**` |

The globs originate in the persona source YAML (`agents/personas/*.yaml` `triggers.conditions.paths`),
**not** in the concurrency logic this change touches. Fixing it means editing persona sources and
regenerating — a different blast radius and a different defect. Deliberately **not** folded in;
filed as a follow-up. Per the skill's escalation rule for a long-dead gate: re-arming it should be
preceded by one manual run against the current tree, because it will surface a backlog.

### [INFO] action pinning — persona workflows

`pnpm/action-setup@v5` is third-party on a mutable major tag. The repo SHA-pins **nothing**
(`grep -rE 'uses: [^ ]+@[0-9a-f]{40}' .github/workflows/` → 0 hits), so tag pinning is the
established convention. No action; recorded for completeness.

### Checks that came back clean

- **M2 permissions** — every persona workflow declares `permissions: { contents: read }`. Least-privilege, correct.
- **M4 self-trigger / push-back** — no `git push` or `git commit` in any persona workflow; they are read-only advisory jobs. No re-trigger guard needed.
- **M5 / J1 injection** — no `${{ github.event.* }}` interpolation into any `run:` step. No `pull_request_target`.
- **J4 fork-PR degradation** — jobs neither comment nor label; read-only `GITHUB_TOKEN` suffices.

---

## 2. Decision (F2) — binding, taken by the human

**Chosen: (a) fix the generator and regenerate the seven files.**

Rejected: (b) also fix `packages/cli/src/commands/ci/init.ts:107`, the second, adopter-facing
emitter carrying the identical defect. Rationale: (b) changes scaffolding output for **every
adopter** — a materially larger blast radius than a change to this repo's own dogfooded
workflows. It is a real defect and the repo's known dual-source-of-truth hazard, so it is filed
as a follow-up rather than dropped.

---

## 3. The fix

Apply #1865's blessed shape at the generator, so all seven regenerate with it:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event_name == 'pull_request' && github.ref || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- **push → per-COMMIT group (`github.sha`), never cancelled** — every commit landing on `main`
  reaches its own persona verdict.
- **PR → per-REF group, cancel-in-progress ON** — a new push to a PR still supersedes the old
  run. PR runner spend unchanged.

Consistency with #1865 is the point: the same expression, verbatim, in the third place this
defect lives. #1865 already validated that `cancel-in-progress` officially accepts an expression
and that the `A && B || C` idiom runs on this repo's runners.

### Consequence for the three non-`push` workflows

`persona-codebase-health-analyst`, `persona-entropy-cleaner` and `persona-performance-guardian`
have no `push` trigger, so their behaviour changes only on the `schedule` path: previously a new
scheduled run cancelled an in-flight one; now it queues behind it (group keyed on `github.sha`,
`cancel-in-progress` false). These are weekly/daily crons on advisory jobs — the change is
immaterial, and it is the identical trade #1865 accepted for `ci.yml` / `harness.yml`, which are
also non-PR on their scheduled path.

### Runner spend

Main-branch spend rises with burst size, exactly as in #1865. That increase **is** the fix:
verifying every commit necessarily costs more than verifying one in four. These are
single-job `ubuntu-latest` advisory workflows, so the absolute cost is far below #1865's
three-OS matrix.

---

## 4. Observable truths and their gates

| #   | Truth                                                        | Gate                                                              |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1   | Generator no longer emits `cancel-in-progress: true` literal | new unit test in `ci-workflow.test.ts`                            |
| 2   | Generator emits the event-conditional group expression       | new unit test asserts the exact string                            |
| 3   | PR event still cancels superseded runs                       | test asserts the `pull_request` branch of the expression          |
| 4   | Push event is keyed on `github.sha`, not `github.ref`        | test asserts `github.sha` present, bare `github.ref }}` absent    |
| 5   | All 7 committed workflows match generator output             | `pnpm generate:persona-workflows:check` (CI, ubuntu)              |
| 6   | Every regenerated file still parses as YAML                  | `generate:persona-workflows:check` + prettier                     |
| 7   | No unrelated file changed                                    | `git diff --stat` is exactly generator + 7 yml + test + this plan |
| 8   | `ci/init.ts` untouched                                       | `git diff --name-only` excludes it                                |
| 9   | Existing generator behaviour unregressed                     | full `ci-workflow.test.ts` suite green                            |
| 10  | Repo gates pass without `--no-verify`                        | pre-commit + pre-push clean                                       |

---

## 5. Change delta

| path                                                        | change                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/cli/src/persona/generators/ci-workflow.ts`        | event-split concurrency + a comment citing #1865/#1867                                    |
| `.github/workflows/persona-*.yml` (7)                       | regenerated                                                                               |
| `packages/cli/tests/persona/generators/ci-workflow.test.ts` | update the stale `cancel-in-progress === true` assertion; add a dedicated regression test |
| `docs/changes/persona-workflow-cancel-1867/plans/`          | this plan                                                                                 |

Explicitly **not** touched: `packages/cli/src/commands/ci/init.ts`, `agents/personas/*.yaml`,
`scripts/main-health-check.mjs`.

---

## 6. Follow-ups (filed, not done here)

1. `packages/cli/src/commands/ci/init.ts:107` — adopter-facing emitter with the identical
   defect (dual source of truth with the persona generator).
2. `persona-architecture-enforcer.yml` `paths: src/**` — dead PR path filter, gate has never
   fired; fix at the persona source YAML.
