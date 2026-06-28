# Plan: Phase 5 — Auto-done reconciler

**Date:** 2026-06-27 | **Spec:** docs/changes/roadmap-shard-store/proposal.md (Phase 5, Decision D6) | **Tasks:** 9 | **Time:** ~42 min | **Integration Tier:** medium

## Goal

When a merged PR closes a roadmap row's linked GitHub issue (`External-ID: github:owner/repo#NNN`), automatically flip exactly that row's shard to `done` — conflict-free, idempotent, store-routed — via one shared core function exposed through both a `harness roadmap reconcile` CLI (offline fallback) and a `pull_request: closed` GitHub Action (authoritative).

## Observable Truths (Acceptance Criteria)

EARS-framed, goal-backward from D6 ("auto-done flips ONLY `→ done` on merge").

1. **(Event-driven) Single-row auto-done.** When the reconciler is given a closed `External-ID` that maps to a non-`done` row, the system shall set that row's status to `done` and rewrite **only** that row's shard (`docs/roadmap.d/<slug>.md`), never another shard. Verified by a write-scope assertion (exactly one shard changes per matched issue).
2. **(Event-driven) N issues → N shards.** When the reconciler is given N closed `External-ID`s mapping to N distinct rows, the system shall patch exactly those N shards (each its own file → conflict-free). Verified by a multi-issue test.
3. **(Ubiquitous) Idempotent.** Re-running the reconciler over an already-`done` row shall produce no store write for that row (reported as `alreadyDone`, not `markedDone`). Verified by a double-invocation test asserting zero second-pass writes.
4. **(State-driven) Assignee lifecycle preserved.** While a matched row is `in-progress` with a live assignee, flipping it to `done` shall clear the assignee and append exactly one `unassigned` assignment-history record — routed through `setStatus` (the assignee-lifecycle authority), so `assignee ≠ null ⟺ in-progress` holds. Verified by an in-progress→done test asserting `assignee === null` and one history record.
5. **(Unwanted) No other transitions.** If a closed `External-ID` maps to no row, the reconciler shall not write anything for it (reported as `unmatched`); and the reconciler shall never move any row to a status other than `done` (no auto-promote, no regression, no un-done). Verified by an unmatched-id test and an assertion that only `setStatus(..., 'done', ...)` is invoked.
6. **(Ubiquitous) Store-routed, both modes.** The reconciler shall read and write **only** through `resolveRoadmapStore` + `applyRoadmapDiff` (never a direct `roadmap.md` read/write), working in both sharded mode (per-shall single-shard patch + aggregate regen) and monolith mode (whole-file rewrite). Verified by running the core test against both an in-memory `RoadmapStore` and a real temp-dir `ShardStore`, and by the `roadmap-read-source.repo.test.ts` guard staying green (the new files name no `roadmap.md` literal and thread no `roadmapPath` fs call).
7. **(Optional) CLI offline fallback.** Where `harness roadmap reconcile` is run with a configured tracker + token, the system shall fetch current issue state, compute the set of closed issues, and reconcile; with `--from-issues <n,...>` it shall reconcile exactly those issue numbers against the configured repo without any network fetch. Verified by command tests with an injected adapter/store.
8. **(Event-driven) PR-merge Action.** When a PR is closed **and merged**, the workflow shall resolve the PR's closing issue references, no-op if none are roadmap-linked, otherwise run `harness roadmap reconcile --from-issues`, and commit the changed shard(s) + regenerated aggregate. The workflow shall **not** run on a closed-unmerged PR. Verified by a workflow-shape test (parse YAML; assert the `merged == true` gate, the no-op gate, and the reconcile invocation).
9. **(Ubiquitous) Gates held.** `harness validate` stays at the baseline (365, zero NEW) and `harness check-deps` at 2 (pre-existing cli cycles). No NEW findings.

## Uncertainties

- **[ASSUMPTION → T2] Core takes `External-ID` strings, not the adapter.** The core reconcile function is pure (store + a set of closed `External-ID` strings); network/issue-state discovery lives at the edges (CLI fetch, Action GraphQL). This keeps core unit-testable without `fetch` and matches `fullSync`'s store-routed writeback shape. If rejected (core owns the adapter), the CLI/Action split collapses and tests need network mocks. **Recommended: accept.**
- **[DECISION → CHECKPOINT, T7] How the Action commits to `main`.** `pull_request: closed` fires _after_ the merge, so the base ref already contains the merge. The Action checks out the base branch, runs reconcile, and must land the shard flip(s). Direct push to a protected `main` requires either a bypass token (`contents: write` + branch-protection allowance / app token) or an alternative (open a follow-up PR / push to a side branch). D6 says "commits to `main`"; the _mechanism_ is a human/infra decision (branch protection here has no required status checks per repo memory, but pushes still need the right token). **Flagged — see Concerns; `[checkpoint:human-verify]` on T7.**
- **[DECISION → CHECKPOINT, T4] Offline CLI + "closed as not planned".** `ExternalTicketState` carries only `status: open|closed`, not GitHub's `state_reason` (`completed` vs `not_planned`). The **Action path is correct** (it uses the PR's `closingIssuesReferences` — closed _by merge_ = completed). The **offline CLI path**, mapping raw `closed → done`, would also flip rows for `wontfix`/`not_planned`-closed issues. Options: (a) accept (offline catch-up is best-effort and rare); (b) extend the adapter to expose `state_reason` and only treat `completed` as done. **Flagged — `[checkpoint:decision]` at T4; recommended (a) for Phase 5, file (b) as a follow-up row.**
- **[DEFERRABLE] reopened → un-done.** D6 + Non-goals scope auto-done to `→ done` on merge only. Issue-reopened → un-`done` is explicitly out of scope. Noted in Concerns; no task.
- **[DEFERRABLE] sync mutex.** `fullSync` serializes writeback behind an in-process mutex; reconcile is a separate one-shot invocation (CLI process / CI job) and does not share it. Acceptable — no concurrent in-process writer in either trigger surface. Noted, no task.
- **[DEFERRABLE] Docs/skill updates.** Spec routes AGENTS.md / skill notes ("agents stop hand-marking rows") and the D2/R ADRs to **Phase 6 (Rollout)**. Phase 5 ships only the changeset; do NOT duplicate docs here.

## Reuse Map (investigated — do NOT reinvent)

- `setStatus(roadmap, feature, 'done', date)` — `packages/core/src/roadmap/assignee-lifecycle.ts:169`. The status-change chokepoint; flips status and auto-clears the assignee (+ `unassigned` history) on leaving `in-progress`. **This is the entire "reuse the assignee-lifecycle rule" requirement.**
- `applyRoadmapDiff(store, before, after)` — `packages/core/src/roadmap/store/apply-diff.ts`. Diffs two in-memory `Roadmap`s into minimal per-shard ops (one `patchFeature` per changed row → N shards for N rows; `patchAssignmentHistory` → `_meta.md` for the cleared-assignee record). Same store seam every Phase 4 writer uses.
- `resolveRoadmapStore({ projectRoot })` / `resolveRoadmapStoreForFile` — `packages/core/src/roadmap/store/factory.ts`. Picks `ShardStore` (sharded) vs `MonolithStore`, and in sharded mode regenerates the aggregate after each mutation (`withAggregateRegen`). Reconcile reuses this verbatim — no new file readers, so invariant R is untouched.
- `parseExternalId` (exported) + `buildExternalId` (currently private) — `packages/core/src/roadmap/adapters/github-issues.ts:17,28`. The `github:owner/repo#NNN` ↔ parts mapping. Reused at the edges to build `External-ID`s from issue numbers + the configured repo (avoids format drift).
- `GitHubIssuesSyncAdapter.fetchAllTickets()` → `ExternalTicketState[]` (each with `externalId` + `status`) — `adapters/github-issues.ts:407`. The offline CLI fetch source.
- `loadTrackerSyncConfig(projectРoot)` + token/.env loading pattern — mirror `triggerExternalSync` in `packages/cli/src/mcp/tools/roadmap-auto-sync.ts:62` to build the adapter in the CLI.
- **Distinct domain — do NOT conflate:** the lane state machine (`packages/core/src/state/event-sourcing/lane-machine.ts`, `planned→…→done`) governs orchestrator/autopilot **task lanes**, not roadmap-row status. Reconcile operates on `RoadmapFeature.status` via `setStatus`; it must not import or reuse `lane-machine`. (Checked: no shared `done`-helper is worth coupling — `setStatus` already is the roadmap-row authority.)
- Pattern precedent for the whole shape: `fullSync` (`sync-engine.ts:238`) — load via store, clone `before`, mutate, `applyRoadmapDiff`. Reconcile is a thinner sibling (no push/pull, just `→ done`).

## File Map

### Core — reconcile function

- CREATE packages/core/src/roadmap/reconcile.ts (core `reconcileDoneFromClosedIssues` + result type)
- CREATE packages/core/tests/roadmap/reconcile.test.ts
- MODIFY packages/core/src/roadmap/adapters/github-issues.ts (export `buildExternalId`)
- MODIFY packages/core/src/roadmap/index.ts (barrel: export `reconcileDoneFromClosedIssues`, `ReconcileResult`, `parseExternalId`, `buildExternalId`)
- MODIFY packages/core/tests/roadmap/mode-public-surface.test.ts (assert new barrel exports) — or a focused public-surface assertion in reconcile.test.ts

### CLI — `harness roadmap reconcile`

- CREATE packages/cli/src/commands/roadmap/reconcile.ts (`runRoadmapReconcile` + `createRoadmapReconcileCommand`)
- CREATE packages/cli/tests/commands/roadmap/reconcile.test.ts
- MODIFY packages/cli/src/commands/roadmap/index.ts (register the subcommand)

### CI — GitHub Action

- CREATE .github/workflows/roadmap-auto-done.yml
- CREATE packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts (workflow-shape guard)

### Integration

- CREATE .changeset/roadmap-shard-store-phase5.md

## Skeleton (produced — standard rigor, 9 tasks ≥ 8)

1. Core reconcile function + barrel exports, TDD (~3 tasks, ~16 min)
2. CLI `harness roadmap reconcile` (offline + `--from-issues`), TDD (~3 tasks, ~14 min)
3. PR-merge GitHub Action + shape guard (~1 task, ~6 min) — `[checkpoint:human-verify]`
4. Integration: changeset + final gate (~2 tasks, ~6 min) — `[checkpoint:human-verify]`

_Skeleton approved: pending review (see sign-off at end)._

## Tasks

### Task 1: Export `buildExternalId` from the GitHub adapter + barrel

**Depends on:** none | **Files:** packages/core/src/roadmap/adapters/github-issues.ts, packages/core/src/roadmap/index.ts

1. In `packages/core/src/roadmap/adapters/github-issues.ts`, change `function buildExternalId(...)` (line ~28) to `export function buildExternalId(...)`. Leave the body unchanged (`return \`github:${owner}/${repo}#${number}\`;`).
2. In `packages/core/src/roadmap/index.ts`, where `GitHubIssuesSyncAdapter` is exported from `./adapters/github-issues`, add: `export { parseExternalId, buildExternalId } from './adapters/github-issues';`
3. Run: `pnpm --filter @harness-engineering/core build`
4. Run: `harness validate` (expect 365, zero NEW)
5. Commit: `feat(roadmap): export External-ID build/parse helpers for reconcile reuse`

### Task 2: Core `reconcileDoneFromClosedIssues` (TDD)

**Depends on:** Task 1 | **Files:** packages/core/src/roadmap/reconcile.ts, packages/core/tests/roadmap/reconcile.test.ts

Reuses `setStatus` (assignee-lifecycle) + `applyRoadmapDiff` (store seam). Core is pure: no adapter, no fetch.

1. Write `packages/core/tests/roadmap/reconcile.test.ts` FIRST. Use an in-memory fake `RoadmapStore` (holds a `Roadmap`; `load` returns a clone; `patchFeature`/`addFeature`/`removeFeature`/`patchFrontmatter`/`patchAssignmentHistory` mutate it and record call counts) so `applyRoadmapDiff` exercises real op-emission without fs. Cases:
   - **markedDone:** a `planned` row whose `externalId` is in the closed set → result `markedDone: [name]`, `alreadyDone: []`, `unmatched: []`; store recorded exactly one `patchFeature` for that slug; row status now `done`.
   - **multi (Truth 2):** two closed ids → two distinct rows flipped; exactly two `patchFeature` calls.
   - **idempotent (Truth 3):** row already `done` in the closed set → `alreadyDone: [name]`, `markedDone: []`; zero `patchFeature` calls.
   - **assignee lifecycle (Truth 4):** an `in-progress` row with `assignee: '@dev'` → after reconcile, `assignee === null`, status `done`, exactly one new `unassigned` record in `assignmentHistory` (assert via the store's recorded `patchAssignmentHistory` payload).
   - **unmatched (Truth 5):** a closed id not present on any row → `unmatched: ['github:o/r#999']`, zero writes.
   - **only → done (Truth 5):** assert the function never produces a non-`done` status (e.g. a `blocked` matched row goes straight to `done`).
   - **mode parity (Truth 6):** repeat the markedDone case against a real temp-dir `ShardStore` built via `resolveRoadmapStoreForFile` over a `roadmap.d/` fixture; assert only the matched shard file content changed.
2. Run: `pnpm --filter @harness-engineering/core test reconcile` — observe failures (module missing).
3. Create `packages/core/src/roadmap/reconcile.ts`:
   - Export `interface ReconcileResult { markedDone: string[]; alreadyDone: string[]; unmatched: string[]; }`
   - Export `async function reconcileDoneFromClosedIssues(store: RoadmapStore, closedExternalIds: Iterable<string>, options?: { date?: string }): Promise<Result<ReconcileResult>>`:
     - `const closed = new Set(closedExternalIds);`
     - `const loaded = await store.load(); if (!loaded.ok) return loaded;`
     - `const roadmap = loaded.value; const before = structuredClone(roadmap);`
     - Build `byExternalId: Map<string, RoadmapFeature>` over all milestones' features that have an `externalId`.
     - Initialize result arrays; `const date = options?.date ?? new Date().toISOString().slice(0, 10);`
     - For each `id` of `closed`: `const f = byExternalId.get(id); if (!f) { result.unmatched.push(id); continue; }` ; `if (f.status === 'done') { result.alreadyDone.push(f.name); continue; }` ; `setStatus(roadmap, f, 'done', date); result.markedDone.push(f.name);`
     - `const persisted = await applyRoadmapDiff(store, before, roadmap); if (!persisted.ok) return persisted;`
     - `return Ok(result);`
   - Imports: `setStatus` from `./assignee-lifecycle`, `applyRoadmapDiff` from `./store/apply-diff`, `resolveRoadmapStoreForFile`/types as needed, `Ok` + types from `@harness-engineering/types`. **No `roadmap.md` literal, no `roadmapPath` fs call** (invariant R).
4. Run: `pnpm --filter @harness-engineering/core test reconcile` — observe pass.
5. Run: `harness validate` (expect 365, zero NEW)
6. Commit: `feat(roadmap): core auto-done reconciler (closed issue → row done, store-routed)`

### Task 3: Barrel-export reconcile + public-surface assertion (TDD)

**Depends on:** Task 2 | **Files:** packages/core/src/roadmap/index.ts, packages/core/tests/roadmap/reconcile.test.ts

1. Add to the reconcile test a `describe('public surface')` block importing `reconcileDoneFromClosedIssues` and the type from the package entry (`@harness-engineering/core`) and asserting the symbol is a function. Run — observe failure (not yet exported).
2. In `packages/core/src/roadmap/index.ts` add: `export { reconcileDoneFromClosedIssues } from './reconcile';` and `export type { ReconcileResult } from './reconcile';`
3. Run: `pnpm --filter @harness-engineering/core build && pnpm --filter @harness-engineering/core test reconcile` — observe pass.
4. Run: `harness validate`
5. Commit: `feat(roadmap): export reconcileDoneFromClosedIssues from core barrel`

### Task 4: CLI `runRoadmapReconcile` — offline (fetch current issue state) mode (TDD)

**Depends on:** Task 3 | **Files:** packages/cli/src/commands/roadmap/reconcile.ts, packages/cli/tests/commands/roadmap/reconcile.test.ts | **Category:** integration

`[checkpoint:decision]` — Before implementing, confirm the offline "closed → done" mapping is acceptable for Phase 5 despite the `not_planned`/`wontfix` nuance (see Uncertainties). Default recommendation: accept now, file the `state_reason` refinement as a follow-up row. Pause and surface this; do not silently choose.

1. Write `packages/cli/tests/commands/roadmap/reconcile.test.ts` FIRST. Make `runRoadmapReconcile` accept injectable deps `{ cwd, store?, adapter?, config?, fromIssues? }` so tests pass a fake adapter (`fetchAllTickets` → `[{ externalId, status, ... }]`) + a real temp-dir store. Offline-mode cases:
   - tickets with mixed `open`/`closed` → only the `closed` externalIds are passed to core → matching rows flip to `done`; result surfaces `markedDone`.
   - no closed tickets → core returns empty result; command reports "nothing to reconcile" and exit 0.
   - missing tracker config / token (and no injected adapter) → graceful `CLIError` (exit non-zero), no throw.
2. Run: `pnpm --filter @harness-engineering/cli test reconcile` — observe failure.
3. Create `packages/cli/src/commands/roadmap/reconcile.ts`:
   - `runRoadmapReconcile(opts)` → resolve `store = opts.store ?? resolveRoadmapStore({ projectRoot: cwd })`; guard `roadmapSourceExists(cwd)` else `CLIError`.
   - Build the closed-id set: if `opts.adapter` injected use it, else build a `GitHubIssuesSyncAdapter` exactly like `triggerExternalSync` (`loadTrackerSyncConfig(cwd)`, load `.env`, require `GITHUB_TOKEN`, else `CLIError`). `const tickets = await adapter.fetchAllTickets();` → `closed = tickets.value.filter(t => t.status === 'closed').map(t => t.externalId)`.
   - `const r = await reconcileDoneFromClosedIssues(store, closed);` map `!r.ok` → `CLIError`. Log a summary via `logger` (`markedDone`/`alreadyDone`/`unmatched` counts).
   - Provide a `createRoadmapReconcileCommand()` Commander wrapper with `--cwd <dir>` (mirror `regen.ts`); `--from-issues` is added in Task 5.
4. Run: `pnpm --filter @harness-engineering/cli test reconcile` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): harness roadmap reconcile (offline auto-done from closed issues)`

### Task 5: CLI `--from-issues` authoritative path (TDD)

**Depends on:** Task 4 | **Files:** packages/cli/src/commands/roadmap/reconcile.ts, packages/cli/tests/commands/roadmap/reconcile.test.ts | **Category:** integration

1. Add test cases: `runRoadmapReconcile({ cwd, store, config: { repo: 'o/r', ... }, fromIssues: [527, 640] })` builds externalIds `github:o/r#527`, `github:o/r#640` via `buildExternalId` and reconciles them **without** calling the adapter (assert the injected adapter's `fetchAllTickets` is never called). Run — observe failure.
2. In `reconcile.ts`: when `opts.fromIssues` (or the `--from-issues <list>` option) is set, skip the fetch; derive `repo` from `loadTrackerSyncConfig(cwd)?.repo` (or `opts.config.repo`), `closed = fromIssues.map(n => buildExternalId(owner, repo, n))` (split `repo` on `/`). Error if no repo configured.
3. Add `.option('--from-issues <numbers>', 'comma-separated issue numbers (authoritative; skips network fetch)')` to the Commander wrapper, parsing to `number[]`.
4. Run: `pnpm --filter @harness-engineering/cli test reconcile` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): harness roadmap reconcile --from-issues authoritative path`

### Task 6: Register the reconcile subcommand

**Depends on:** Task 5 | **Files:** packages/cli/src/commands/roadmap/index.ts | **Category:** integration

1. In `packages/cli/src/commands/roadmap/index.ts`, import `createRoadmapReconcileCommand` and `roadmap.addCommand(createRoadmapReconcileCommand());`.
2. Run: `pnpm --filter @harness-engineering/cli test` (full CLI suite — catches any command/help snapshot needing an update; if a snapshot test fails purely on the added subcommand, update it with `-u` and re-run).
3. Run: `harness validate`
4. Commit: `feat(cli): register harness roadmap reconcile subcommand`

### Task 7: PR-merge GitHub Action + workflow-shape guard

**Depends on:** Task 6 | **Files:** .github/workflows/roadmap-auto-done.yml, packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts | **Category:** integration

`[checkpoint:human-verify]` — The commit-to-`main` mechanism (token / branch-protection / push-vs-PR) is an infra decision (see Uncertainties + Concerns). Present the drafted workflow's permissions + push step and get confirmation before finalizing. Do not assume a bypass token exists.

1. Write `packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts` FIRST (mirror the existing `tests/ci/notify.test.ts` style). Parse the YAML with the repo's yaml lib and assert: `on.pull_request.types` includes `closed`; a job-level or step-level `if` contains `github.event.pull_request.merged == true`; `permissions.contents` is `write`; a step runs `harness roadmap reconcile` with `--from-issues`; a guard step no-ops when there are no closing issue references. Run — observe failure (file missing).
2. Create `.github/workflows/roadmap-auto-done.yml`:
   - `on: pull_request: { types: [closed] }`
   - `permissions: { contents: write, issues: read, pull-requests: read }`
   - job `auto-done` with `if: github.event.pull_request.merged == true`.
   - Steps: checkout the base ref; setup node + pnpm; install + `pnpm build` (or use the published CLI bin); a step that resolves the PR's closing issues via GraphQL `closingIssuesReferences` (e.g. `gh api graphql`) into a comma list, and **sets a "no roadmap-linked closing issues → exit 0" guard** (skip the rest when empty); run `harness roadmap reconcile --from-issues "$ISSUES"`; commit `docs/roadmap.d/ docs/roadmap.md` if `git status --porcelain` is non-empty and push to the base branch (with a `git pull --rebase` retry loop for concurrent merges). Add a leading comment block documenting the commit-to-main decision recorded at the checkpoint.
3. Run: `pnpm --filter @harness-engineering/cli test roadmap-auto-done-workflow` — observe pass.
4. Run: `harness validate`
5. Commit: `feat(ci): PR-merge auto-done reconcile workflow`

### Task 8: Changeset

**Depends on:** Task 7 | **Files:** .changeset/roadmap-shard-store-phase5.md | **Category:** integration

1. Create `.changeset/roadmap-shard-store-phase5.md` with a frontmatter bumping `@harness-engineering/core` and `@harness-engineering/cli` (minor), summarizing: core `reconcileDoneFromClosedIssues`, `harness roadmap reconcile` CLI (offline + `--from-issues`), and the PR-merge auto-done workflow; note both surfaces share one store-routed core fn (D6).
2. Run: `pnpm check:changesets` (or repo equivalent) — expect OK.
3. Commit: `chore(roadmap): add Phase 5 auto-done changeset`

### Task 9: Final gate + suite verification

**Depends on:** Task 8 | **Files:** none (verification only)

`[checkpoint:human-verify]` — Present the gate results + the two flagged decisions (commit-to-main mechanism, offline `state_reason` nuance) for sign-off before declaring Phase 5 complete.

1. Run: `harness validate` — confirm 365 (zero NEW vs baseline).
2. Run: `harness check-deps` — confirm 2 (pre-existing cli cycles; no new cycle introduced by `reconcile.ts`).
3. Run: `pnpm --filter @harness-engineering/core test` and `pnpm --filter @harness-engineering/cli test` — confirm green (incl. `roadmap-read-source.repo.test.ts` — the new files must not appear as violations).
4. Confirm: no `reconcile`-introduced entry in `ROADMAP_READ_ALLOWLIST` (the new files go through the store, so none is needed).
5. Report task-by-task commit list + gate numbers in the handoff.

## Integration Tier Rationale

**medium** — new feature within existing packages (`core` + `cli`), new public exports (one core fn + type, helper re-exports), one new CLI subcommand, one new CI workflow; ~9 files. No new package, no new skill, no new public REST surface. Wiring (barrel exports, subcommand registration, workflow registration) + project updates (changeset) apply; knowledge materialization (the D2/R ADRs, AGENTS.md/skill notes) is owned by **Phase 6**, not here.

## Notes / Hazards (from prior-phase learnings)

- Rebuild `@harness-engineering/core` dist after core edits before CLI tests run (CLI resolves core from dist) — Tasks 1–3 include `pnpm --filter core build`.
- `applyRoadmapDiff` issues **multiple** underlying store writes (e.g. `patchFeature` + `patchAssignmentHistory`); do not assert single-write call counts with static fs mocks — use the in-memory fake store (records ops) or real temp dirs and read back, per the Phase 4 test-rework note.
- `arch:fail` noise in per-commit hooks is the pre-existing stale-baseline complexity signal — non-blocking; `harness validate` itself is the gate (baseline-relative, zero NEW).
- Never `--no-verify`; never embed `#610`/`#667` hex false-positives in source comments.
- `.husky` regen hooks already keep the aggregate fresh; the sharded store also regenerates the aggregate after each mutation (`withAggregateRegen`), so the CLI reconcile leaves `docs/roadmap.md` current with no extra regen call.
