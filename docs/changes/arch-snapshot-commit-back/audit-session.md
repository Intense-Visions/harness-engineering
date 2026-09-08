# Audit Session: Architecture Snapshot commit-back rejected by branch protection

Status: resolved
Started: 2026-09-07
Skill: `harness-workflow-audit` (INVENTORY -> MECHANICAL -> JUDGMENT -> REPORT)
Fleet: cicd-fleet, item `Architecture Snapshot` (cause: infra-config)
Workflow: `.github/workflows/snapshot.yml`
Error: `remote: error: GH013: Repository rule violations found for refs/heads/main. - Changes must be made through a pull request.`
CI: run 34120963994 (`schedule`, 2026-09-07T12:16:11Z), step `Commit snapshot`

## Phase 1 — INVENTORY

- 23 workflow files under `.github/workflows/*.yml`.
- Commit-back sub-inventory (the scoped defect class) — grep for
  `git push|git commit|gh pr create|peter-evans` returns 5 jobs across 5 files, plus the sibling
  lane's `holiday-confidence-track.yml`.
- `peter-evans/create-pull-request`: **0 occurrences repo-wide.** The push-then-fall-back-to-PR
  idiom is hand-rolled and is the convention.
- Two distinct working shapes found:
  - **PAT self-approve + auto-merge** — `ci.yml:329-380` (baselines), `release.yml:130-175`
    (golden manifest), `roadmap-auto-done.yml:170-205`. All use `secrets.BASELINE_AUTOAPPROVE_PAT`
    and a `scripts/assert-diff-scope.mjs` scope guard.
  - **Plain PR for human review** — `ci.yml:463-500` (comprehension shards). `GITHUB_TOKEN` only.
- `git ls-files` snapshot taken at `e7340f5c9` for path-filter resolution.

## Phase 2 — MECHANICAL

### Step — resolve every path glob (M1)

`snapshot.yml` has no `paths:` filters. Resolved the rest anyway per the skill's gate:

- `src/**` -> **0 tracked files.** Used by 4 `persona-*.yml` workflows. ERROR, out of scope.
- `docs/**` -> 2045; `packages/**` -> 4223;
  `packages/orchestrator/src/gateway/openapi/**` -> 4; `packages/types/src/auth.ts` -> 1;
  `docs/api/openapi.yaml` -> 1; `.github/workflows/openapi-drift-check.yml` -> 1. All live.

### Step — read the failing step, do not trust the summary (M4)

`gh run view 34120963994 --log-failed` shows, in order, inside the **`Commit snapshot`** step:

1. `turbo run test:coverage` -> `Running test:coverage in 0 packages` / `No tasks were executed`
2. `Coverage ratchet: all packages meet or exceed baselines. (7 package(s) skipped)`
3. `node scripts/generate-docs.mjs "--check"` -> `✓ All reference docs are fresh.`
4. `node scripts/generate-tool-catalog.mjs --check` -> `✓ Tool & skill catalog is up to date.`
5. `remote: error: GH013 ... - Changes must be made through a pull request.`
6. `! [remote rejected] main -> main` / `##[error]Process completed with exit code 1`

Two facts, both load-bearing:

- Steps 1-4 are the **husky pre-commit gauntlet running inside the workflow step**. They passed on
  this run; they are a latent second failure mode on a run where a generated artifact has drifted on
  main. This is why fork D1 (`HUSKY=0`) is a real fix and not decoration.
- Step 5 is the actual cause. `permissions: contents: write` is token scope; the ruleset is enforced
  server-side and no token scope satisfies it. The only fix is to stop pushing to `main` directly.

### Step — establish it is systematic, not a one-off

`gh run list --workflow=snapshot.yml --limit 15` -> **15 runs, 15 `failure`, all `event=schedule`**,
`2026-06-01T11:51:31Z` through `2026-09-07T12:16:11Z`. No success anywhere in visible history.

### Step — other mechanical checks on snapshot.yml

- M2 permissions: `contents: write` only -> insufficient once a PR fallback exists. ERROR.
- M3 pinning: `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v5`. All 12
  distinct `uses:` refs repo-wide are mutable tags; **nothing** is SHA-pinned. Consistent with
  convention. INFO, repo-wide, not fixed here.
- M4.2 `[skip ci]`: absent from the snapshot commit subject; present in all four working
  precedents. ERROR.
- M4.5 concurrency: no `concurrency:` group; cron + `workflow_dispatch` can overlap. WARNING.
- M5 secrets: clean, none referenced.
- M6 dead refs: `snapshot capture` resolves — `_registry.ts:102` registers `createSnapshotCommand`,
  `snapshot.ts:238` declares `capture`. Clean.

## Phase 3 — JUDGMENT (not skipped; Phase 2 was not clean, and this is where the impact is)

### J2 — the gate has been dead for five months

- `git log -1 -- .harness/arch/timeline.json` -> `f8d593648` `2026-04-06`
  _"chore: architecture snapshot 2026-04-06"_.
- File is 826 bytes and holds **exactly one** entry:
  `capturedAt: 2026-04-06T14:20:52.339Z`, `commitHash: 0669068`, `stabilityScore: 57`.
- Consumers traced:
  - `packages/core/src/architecture/prediction-engine.ts:81` —
    `if (snapshots.length < 3) throw "PredictionEngine requires at least 3 snapshots, got N"`.
    With 1 point, `predict_failures` has thrown for five months.
  - `packages/core/src/architecture/timeline-manager.ts:116` — `snapshots.length === 1` degenerate
    branch, so `get_decay_trends` / `harness snapshot trend` return "no trend", which reads
    identically to "stable".
  - `packages/cli/src/mcp/tools/decay-trends.ts:77`, `packages/core/src/insights/aggregator.ts:78`.
- **No staleness signal exists.** No consumer compares `capturedAt` to now. The Iron Law case
  exactly: the gate manufactured confidence while enforcing nothing.

### J1 / J3 / J4

- J1 injection: clean. Only `$(date +%Y-%m-%d)`; no `github.event.*`, no `head_ref`, no
  `pull_request_target`. The new `GH_TOKEN` is routed through `env:`.
- J3 ratchet calibration: N/A — `snapshot capture` is observational and gates nothing.
- J4 fork-PR degradation: N/A — `schedule` + `workflow_dispatch` only; no fork path.

## Phase 4 — REPORT / FIX

Applied to `.github/workflows/snapshot.yml`, mirroring `ci.yml:463-500`: explicit empty-diff
short-circuit, `[skip ci]`, `HUSKY=0`, `GH_TOKEN`, `pull-requests: write`, `concurrency:` group,
direct push -> `chore/arch-snapshot-<epoch>` branch off `origin/main` -> `gh pr create` for human
review, plus a duplicate-snapshot-PR guard (append-only weekly artifact; see the plan for why this
one line deviates from the precedent).

Reported but deliberately NOT fixed: dead `src/**` filter in 4 `persona-*.yml`;
`holiday-confidence-track.yml` bare push (sibling lane, fork E1); repo-wide mutable action tags;
missing staleness signal in the timeline consumers.

## Local verification

- YAML parses; `permissions` -> `{"contents":"write","pull-requests":"write"}`; `concurrency` ->
  `{"group":"architecture-snapshot","cancel-in-progress":false}`; commit-step `env` ->
  `{"HUSKY":"0","GH_TOKEN":"${{ secrets.GITHUB_TOKEN }}"}`.
- `bash -n` on the extracted `Commit snapshot` script — clean.
- Duplicate-PR guard executed live: returns empty, takes the `would-create` branch correctly.
- The PR-fallback path itself is only exercisable by a real run against the protected branch; it is
  the same shape already proven in `ci.yml`.
