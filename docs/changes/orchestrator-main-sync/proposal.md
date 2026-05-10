---
title: Orchestrator Main-Branch Sync
status: proposed
owner: Chad Warner
keywords: [orchestrator, maintenance, git-sync, fast-forward, dashboard, run-now]
---

# Orchestrator Main-Branch Sync

## Overview

The orchestrator picks roadmap items, dispatches agents in worktrees, and opens PRs. When those PRs merge upstream, the orchestrator's own checkout (its `cwd`) drifts: its local `main` ref is never updated, so files it reads from `cwd` — most importantly `docs/roadmap.md` and `harness.orchestrator.md` — go stale until the operator manually pulls. New worktrees themselves are already safe (`tryFetch()` runs per dispatch, base ref resolves from `origin/HEAD`), but the orchestrator process keeps reasoning off stale local state.

This change adds a periodic `main-sync` maintenance task that fast-forwards the orchestrator's local default branch from origin on a 15-minute cron, plus a small dashboard improvement so the existing "Run Now" affordance works for **any** maintenance task — not just `project-health`.

## Goals

1. **Eliminate manual `git pull` after upstream merges.** The orchestrator keeps its local default branch fast-forwarded automatically.
2. **Stay safe by default.** Sync is fast-forward-only. It never destroys uncommitted work, never resolves conflicts, never force-pushes.
3. **Make sync observable.** Skip-conditions (dirty tree, divergence, wrong branch) surface as warnings in the dashboard's existing maintenance event stream.
4. **Generalize "Run Now".** The dashboard's manual-trigger button works per-task, not just for one hardcoded task.
5. **Confirm worktrees can't drift.** Add a defensive warning when worktree base-ref resolution falls back to a local-only branch (origin unreachable).

## Non-Goals

- No rebasing, merging, or conflict resolution. If sync can't fast-forward, it skips and warns.
- No syncing of branches other than the repo's default branch (`origin/HEAD`).
- No syncing of active worktrees mid-run.
- No new task type, no new dashboard infrastructure. Reuse housekeeping + existing schedule view.
- No changes to PR detection, branch sweeping, or worktree lifecycle beyond the one defensive log.

## Decisions

### D1. Scope is the orchestrator's local checkout, not worktrees

**Decision:** Sync targets the orchestrator's `cwd` (its repo root). Worktrees are out of scope; they already get a fresh `tryFetch()` per dispatch and base on `origin/HEAD`.

**Rationale:** The pain is "files read from `cwd` are stale after merge" (`docs/roadmap.md`, `harness.orchestrator.md`). Worktree freshness is already solved by `WorkspaceManager.ensureWorkspace()` at `packages/orchestrator/src/workspace/manager.ts:62`.

### D2. Fast-forward only, with surfaced warnings

**Decision:** Sync runs `git fetch origin` then `git merge --ff-only origin/<default>`. If the merge fails for any reason (dirty tree conflict, local divergence, current branch ≠ default), the task skips and emits a structured warning event.

**Rationale:** The orchestrator's checkout is a live working directory — maintenance tasks themselves write to `.harness/security/timeline.json` etc. during runs. Auto-stash/rebase risks leaving the tree in a half-applied state mid-orchestrator-run. FF-only is non-destructive: it either advances the ref cleanly or fails without side effects.

### D3. Cron-based maintenance task, default 15 min, opt-out

**Decision:** Implement as a built-in housekeeping task in `task-registry.ts` with schedule `*/15 * * * *`. Active by default whenever `maintenance.enabled: true`. User can disable via config.

**Rationale:** "Somewhat regular basis" matches a 15-min window. Cron fits the maintenance scheduler's existing pattern. Opt-out is right because the whole point is to remove manual sync — opt-in defeats the purpose, and FF-only safety means there's no destructive failure mode worth gating.

### D4. Reuse housekeeping task type via new `harness sync-main` CLI

**Decision:** No new task type. Sync ships as a `housekeeping` task whose `checkCommand` is `['harness', 'sync-main', '--json']`, backed by a new `packages/cli/src/commands/sync-main.ts` subcommand.

**Rationale:** The housekeeping pattern (`session-cleanup`, `perf-baselines`) is already established for "small mechanical commands, no AI, no PR." Adding a new task type for a single task would be premature abstraction. The CLI roundtrip cost (~50ms) is negligible against fetch latency.

**Why prefix `harness`:** The orchestrator's `commandExecutor` (orchestrator.ts:466) invokes `command[0]` as a literal binary via `execFile`. There is no `sync-main` binary on PATH; subcommands resolve only through the `harness` CLI entry. Existing housekeeping entries (`['cleanup-sessions']`, `['perf', 'baselines', 'update']`) appear to share this latent bug — fixing them is out of scope for this spec but tracked separately. For `main-sync` we use the explicit `harness <subcommand>` form to ensure the cron path actually fires in production.

### D5. Dashboard: per-row "Run Now" button on the schedule view

**Decision:** Replace the hardcoded `taskId: 'project-health'` button in `packages/dashboard/src/client/pages/Maintenance.tsx:178` with a per-task "Run Now" action rendered against each row of the schedule data already returned by `GET /api/maintenance/schedule`.

**Rationale:** The HTTP endpoint already accepts arbitrary `taskId`. The schedule view already has the data. Per-row buttons are more discoverable than a dropdown and the right end state regardless of how sync is implemented.

### D6. Defensive warning when worktree base-ref falls back to a local branch

**Decision:** In `WorkspaceManager.resolveBaseRef()` (`packages/orchestrator/src/workspace/manager.ts:134`), emit a structured warning when the priority chain falls past `origin/HEAD` and `origin/main`/`origin/master` to a local-only branch (`main`, `master`, or `HEAD`).

**Rationale:** Addresses the "make sure worktree drift isn't a risk" ask. A fallback past origin nearly always means the remote is misconfigured or unreachable; the operator should know rather than have the orchestrator silently dispatch agents from a local-only ref.

## Technical Design

### File Layout

**New files:**

- `packages/cli/src/commands/sync-main.ts` — the `harness sync-main` subcommand
- `packages/orchestrator/src/maintenance/sync-main.ts` — pure helper that encapsulates fetch + ff-only logic, exported for direct use and reused by the CLI command (so behavior is identical via cron, manual CLI, or dashboard trigger)
- `tests/orchestrator/maintenance/sync-main.test.ts`
- `tests/cli/sync-main.test.ts`

**Edited files:**

- `packages/orchestrator/src/maintenance/task-registry.ts` — register the `main-sync` task
- `packages/cli/src/index.ts` (or wherever subcommands register) — wire `sync-main`
- `packages/orchestrator/src/workspace/manager.ts` — add defensive warning in `resolveBaseRef()` (D6)
- `packages/dashboard/src/client/pages/Maintenance.tsx` — per-row "Run Now" button
- `harness.orchestrator.md` — document the new task

### `syncMain()` Helper

```ts
// packages/orchestrator/src/maintenance/sync-main.ts
export type SyncMainResult =
  | { status: 'updated'; from: string; to: string; defaultBranch: string }
  | { status: 'no-op'; defaultBranch: string }
  | { status: 'skipped'; reason: SyncSkipReason; detail: string; defaultBranch: string }
  | { status: 'error'; message: string };

export type SyncSkipReason =
  | 'wrong-branch' // current branch ≠ default
  | 'diverged' // local default has commits not on origin (non-FF)
  | 'dirty-conflict' // working tree changes conflict with incoming
  | 'no-remote' // origin not configured / no default ref resolved
  | 'fetch-failed'; // network/auth issue

export async function syncMain(repoRoot: string): Promise<SyncMainResult>;
```

**Algorithm:**

1. Resolve default branch via `git symbolic-ref --short refs/remotes/origin/HEAD` (fall through to `origin/main`/`origin/master`). If none resolves, return `skipped: 'no-remote'`.
2. Read current branch via `git rev-parse --abbrev-ref HEAD`. If it doesn't match the default branch's short name, return `skipped: 'wrong-branch'`.
3. `git fetch origin <default> --quiet`. On error, return `skipped: 'fetch-failed'`.
4. Compare `HEAD` to `origin/<default>` via `git merge-base --is-ancestor`:
   - Equal → `no-op`.
   - `HEAD` is ancestor of `origin/<default>` → run `git merge --ff-only origin/<default>`.
     - Success → `updated` (record both SHAs).
     - Failure (working tree conflict) → `skipped: 'dirty-conflict'`.
   - Otherwise (origin behind HEAD or unrelated histories) → `skipped: 'diverged'`.

No working-tree mutations occur on any skip path.

### CLI Command

```
Usage: harness sync-main [--json]
```

Default human-readable output. `--json` emits `SyncMainResult` for the maintenance scheduler to capture in run history. Exits 0 on `updated`/`no-op`/`skipped`. Exits non-zero only on `error` (unexpected exception). Skips are not failures — they are expected operating conditions.

### Task Registry Entry

```ts
// packages/orchestrator/src/maintenance/task-registry.ts
{
  id: 'main-sync',
  type: 'housekeeping',
  description: 'Fast-forward local default branch from origin',
  schedule: '*/15 * * * *',
  branch: null,
  checkCommand: ['harness', 'sync-main', '--json'],
}
```

### Dashboard Change

In `packages/dashboard/src/client/pages/Maintenance.tsx`:

- Render the schedule data (already loaded via `GET /api/maintenance/schedule`) as a table: `Task ID | Type | Next Run | Last Run | Action`.
- Each row's Action cell renders a `<RunNowButton taskId={row.id} />` that POSTs to `/api/maintenance/trigger`.
- Disable the button while a task with that ID is in-flight (track via existing WebSocket `maintenanceEvent` `started`/`completed` events).
- Remove the hardcoded single button at line 178.

### Defensive Warning (D6)

In `WorkspaceManager.resolveBaseRef()`:

- After the priority chain selects a ref, classify it:
  - `origin/HEAD`-derived or explicit `origin/*` → ok.
  - Local-only (`main`, `master`, `HEAD`) → emit a structured event via the orchestrator's existing event bus: `{ kind: 'baseref_fallback', ref, repoRoot }`.
- Surface in the dashboard's same maintenance event stream so it shows up alongside other warnings without a new UI surface.

### Configuration

No new config knobs required. The task respects the existing top-level `maintenance.enabled` toggle. Per-task disable is not part of this spec; it can follow the existing maintenance config pattern when added.

### Error Handling

- All git operations time-bounded by the existing `hooks.timeoutMs` pattern (60s default).
- All skip paths produce structured events; none cause the maintenance scheduler to back off or stop.
- A genuine unexpected error (e.g., `git` binary missing) records as a task failure in run history per existing TaskRunner conventions.

### Requirements (EARS)

- **R1.** When the `main-sync` task fires and the local default branch is strictly behind `origin/<default>`, the system shall fast-forward the local ref to match origin.
- **R2.** When the `main-sync` task fires and the working tree has changes that conflict with incoming commits, the system shall not modify the working tree.
- **R3.** When the orchestrator's current branch is not the repository default branch, the system shall not attempt a fast-forward.
- **R4.** When `resolveBaseRef()` falls back past `origin/HEAD` and `origin/main`/`origin/master` to a local-only ref, the system shall emit a `baseref_fallback` event.
- **R5.** When a user clicks "Run Now" for any task in the dashboard schedule view, the system shall POST that task's ID to `/api/maintenance/trigger` and disable the button until a `completed` or `error` event arrives for that task.

## Integration Points

### Entry Points

- **New CLI subcommand:** `harness sync-main` (with `--json` flag).
- **New maintenance task:** `main-sync` registered in `task-registry.ts`.
- **HTTP endpoint reuse:** `POST /api/maintenance/trigger` already accepts `{ taskId: 'main-sync' }`; no changes needed.
- **Dashboard route reuse:** existing `/s/maintenance` page; no new routes.

### Registrations Required

- Append `main-sync` to `BUILT_IN_TASKS` in `packages/orchestrator/src/maintenance/task-registry.ts`.
- Register the `sync-main` subcommand in the CLI command registry (`packages/cli/src/index.ts` or equivalent).
- No barrel export changes expected; verify via `harness validate` that the new files are picked up by existing exports.
- No new MCP tools.

### Documentation Updates

- **`harness.orchestrator.md`** — Add a brief note under the maintenance section listing `main-sync` alongside other built-in tasks and explaining how to disable it.
- **Maintenance task list documentation** (wherever the 20 built-in tasks are catalogued — likely a generated table). Update count to 21 and add the new row.
- **Dashboard guide** (if one exists) — note that "Run Now" now works per-task.

### Architectural Decisions

- **ADR: Sync via housekeeping task type, not new task type.** Rationale in D4. Captures the YAGNI choice for future contributors who might later wonder why we didn't add a `git-sync` type.

### Knowledge Impact

- **Domain concept:** "default-branch sync" — the orchestrator's responsibility for keeping its own checkout fresh, distinct from worktree freshness.
- **Pattern:** "fast-forward-only with structured skip events" — reusable elsewhere if the orchestrator ever needs to sync other refs.
- **Relationship:** `MaintenanceTask` (housekeeping) → `harness sync-main` CLI → `syncMain()` helper → `git fetch` / `merge --ff-only`.
- **Cross-reference:** `WorkspaceManager.resolveBaseRef()` is the worktree-side counterpart; D6 adds an observable signal when worktree base-ref falls back to local refs.

## Success Criteria

### Functional

1. **Cron sync works.** Starting an orchestrator on a checkout where `main` is N commits behind `origin/main`, after ≤15 minutes the local `main` ref equals `origin/main`. Verified via integration test using a fixture repo.
2. **No-op is silent and cheap.** When local `main` already equals `origin/main`, the task completes with `status: 'no-op'` and no ref/working-tree changes. Verified by file-mtime assertions.
3. **Manual trigger works for any task.** Clicking "Run Now" on the `main-sync` row in the dashboard schedule table triggers the task within 1s and surfaces start/complete events via WebSocket. Same behavior verified for at least one other arbitrary task (e.g., `session-cleanup`).
4. **Roadmap reads stay current.** After a sync that updates `docs/roadmap.md`, the next orchestrator tick reads the updated contents. Verified by integration test that flips a roadmap item upstream and asserts the orchestrator state machine sees the change.

### Safety

5. **Dirty conflicts skip cleanly.** With a working-tree edit to a file that conflicts with incoming changes, the task emits `skipped: 'dirty-conflict'`, the working tree is byte-identical before and after, and the orchestrator continues running.
6. **Divergence skips cleanly.** With a local commit on `main` that isn't on `origin/main`, the task emits `skipped: 'diverged'` and makes no changes.
7. **Wrong branch skips cleanly.** When checked out on a topic branch, the task emits `skipped: 'wrong-branch'` and makes no changes.
8. **Fetch failure is non-fatal.** With `origin` removed/unreachable, the task emits `skipped: 'fetch-failed'` or `'no-remote'`; the scheduler runs again on next interval.

### Observability

9. **Skips surface in the dashboard.** Each skip path produces a `MaintenanceEvent` visible in the live event stream and recorded in run history with reason and detail.
10. **Worktree base-ref fallback is logged.** When `resolveBaseRef()` falls back to a local-only ref, a `baseref_fallback` event appears in the same event stream within one tick of the worktree being created. Verified by an integration test that simulates an unreachable origin and inspects emitted events.

### Health

11. **`harness validate` passes** after the change.
12. **No regression in existing maintenance tasks.** Smoke-trigger each of the 20 existing tasks via the new per-row button and confirm each runs as before.

## Implementation Order

Single PR, four phases. Order chosen so each phase is independently verifiable and the riskiest piece (sync logic) is locked down before UI work begins.

### Phase 1: Sync core (helper + CLI)

<!-- complexity: medium -->

1. Implement `syncMain()` helper in `packages/orchestrator/src/maintenance/sync-main.ts`.
2. Implement `harness sync-main` CLI subcommand wrapping the helper.
3. Unit tests for every status path: `updated`, `no-op`, `skipped:wrong-branch`, `skipped:diverged`, `skipped:dirty-conflict`, `skipped:no-remote`, `skipped:fetch-failed`, `error`.
4. Integration test using a fixture repo with a real `git` binary.

### Phase 2: Maintenance task wiring

<!-- complexity: low -->

5. Register `main-sync` in `task-registry.ts`.
6. Verify the existing TaskRunner's housekeeping path captures the JSON output and records it in run history.
7. Add a smoke test that triggers the task via `POST /api/maintenance/trigger` and asserts a result.

### Phase 3: Defensive worktree warning

<!-- complexity: low -->

8. Add fallback classification in `resolveBaseRef()`.
9. Wire the structured event through the existing orchestrator event bus.
10. Test: run with broken/missing origin, assert `baseref_fallback` emitted exactly once per worktree creation.

### Phase 4: Dashboard generalization

<!-- complexity: medium -->

11. Refactor `Maintenance.tsx` schedule view into a table with per-row "Run Now" buttons.
12. Wire button-disabled state to in-flight WebSocket events.
13. Manual UI test: click "Run Now" for `main-sync` and at least one other task; confirm both trigger and stream events.

### Quality Gates

- After Phase 1: unit tests green.
- After Phase 2: `harness validate` passes; integration test green.
- After Phase 3: warning event fires correctly.
- After Phase 4: dashboard renders all 21 tasks with working buttons.
- Final: `harness validate`, `harness check-docs`, full test suite green.
