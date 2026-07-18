# Retry Preserves Worktree

**Keywords:** orchestrator, workspace, worktree, retry, dispatch, ensureWorkspace, local-model-convergence, staged-workflow

## Overview and Goals

**Problem.** A verification-failure retry of an in-flight unit **discards the agent's partial progress**, so the unit can never converge. `ensureWorkspace` (`packages/orchestrator/src/workspace/manager.ts:138-191`) unconditionally runs `git worktree remove --force` on any existing worktree at the start of **every** dispatch, then recreates it detached from the base ref. That is correct for an orchestrator **restart** (avoid agents working on stale code — the documented reason, `manager.ts:142-144`), but catastrophic for the **retry loop**: when a staged unit fails verification, the tick loop re-selects the still-non-terminal unit and calls `dispatchIssue` again (logged `Dispatching issue: <id> (attempt null)` repeatedly → `ensureWorkspace` at `orchestrator.ts:2089`), wiping the worktree and all uncommitted work. The model redoes everything from zero, fails again, and wipes again.

**Evidence (live, 2026-07-17).** Running the real staged dispatch on a local-model pilot, `qwen3-coder:30b` produced `no-only-tests.test.ts` in pass 2; re-dispatch #3 **deleted it**; 3 re-dispatches / ~25 min, no convergence — for every reasoner tested (`llama3.3:70b`, `gpt-oss:20b`, `qwen3.6:27b`). The failure is the harness discarding work between retries, not model capability. `orchestrator.ts:2155` already states the intent is to "reuse the ONE worktree (D11)" — a direct contradiction with the unconditional remove.

**Goal.** Make a within-run retry **reuse** the existing worktree (preserving uncommitted progress) so partial work accumulates toward done, while a genuinely fresh dispatch / orchestrator restart **still wipes** (anti-stale guarantee intact).

**Out of scope (deferred phase 2).** Durability _across_ an orchestrator restart via committing partial work between stages + rebasing a recreated worktree. This spec does the minimal reuse-on-retry fix; phase 2 is gated on whether it alone achieves convergence.

## Decisions made

- **D1 — In-memory "dispatched-this-run" set (Approach A).** `dispatchIssue` maintains a per-process `Set<identifier>` of units it has provisioned since process start. A dispatch whose identifier is already in the set (and whose worktree still exists and is valid) is a **retry** → preserve the worktree. Otherwise it is a fresh dispatch → wipe + recreate (current behavior). _Why:_ captures the intent exactly ("this process already provisioned this unit → reuse its worktree"), is **restart-correct by construction** (the set is empty after a restart, so the first dispatch of any leftover worktree wipes it), and avoids the lane-state approach whose reconciliation re-derives an `in_progress` lane on restart and would wrongly preserve a stale worktree.
- **D2 — `ensureWorkspace` gains a `preserve` option and reports `reused`.** Signature becomes `ensureWorkspace(identifier, opts?: { preserve?: boolean })` returning `Result<{ path: string; reused: boolean }, Error>`. When `preserve` is true **and** a valid worktree exists, it returns that worktree untouched (`reused: true`, no remove/recreate/seed). Otherwise it performs the current remove→add→seed flow (`reused: false`). _Why:_ a return value is needed so the caller can skip create-only side effects; `preserve` defaults false so every existing caller is byte-identical.
- **D3 — Skip create-only side effects on reuse.** `afterCreate` (`orchestrator.ts:2094`) runs only when `reused === false`; `seedWorkspace` is skipped inside `ensureWorkspace` on the reuse path. `beforeRun` still runs every dispatch (unchanged). _Why:_ re-seeding `fs.cp(force:true)`-overwrites the seed paths (`.harness/proposals`, `docs/roadmap.md`) and could clobber an in-progress proposal the design stage wrote; the `afterCreate` comment already scopes it to "workspace just created/recreated".
- **D4 — Default off / opt-in via the set only.** The reuse path engages only through the in-memory set inside `dispatchIssue`. Single-dispatch and unstaged callers pass no `preserve` → false → unchanged. _Why:_ the hard constraint is byte-identical behavior for the single-dispatch + unstaged paths.

## Technical design

**`packages/orchestrator/src/workspace/manager.ts` (D2).**

- `ensureWorkspace(identifier: string, opts?: { preserve?: boolean }): Promise<Result<{ path: string; reused: boolean }, Error>>`.
- New guard at the top of the try: if `opts?.preserve` and the target path has a valid `.git` marker (existing worktree), return `Ok({ path, reused: true })` **before** the remove block — skipping remove, `worktree add`, and `seedWorkspace`.
- All existing return sites become `Ok({ path, reused: false })`. The remove/recreate/seed body is otherwise unchanged, preserving the anti-stale flow for the fresh path.

**`packages/orchestrator/src/orchestrator.ts` (D1/D3).**

- Add a private field `#dispatchedThisRun = new Set<string>()` (reset only by process lifetime).
- In `dispatchIssue`, before `ensureWorkspace`: `const preserve = this.#dispatchedThisRun.has(issue.identifier);`
- Call `ensureWorkspace(issue.identifier, { preserve })`; read `{ path, reused }`.
- `this.#dispatchedThisRun.add(issue.identifier);` (idempotent).
- Gate `afterCreate`: `if (!reused) { await this.hooks.afterCreate(workspacePath); ... }`.
- The staged-workflow branch (`orchestrator.ts:2158`) and single-agent path are otherwise unchanged — they consume `workspacePath` exactly as today.

**Restart correctness.** After a process restart, `#dispatchedThisRun` is empty. The first dispatch of any unit (even one with a leftover worktree and an `in_progress` lane read-back) computes `preserve = false` → wipes and recreates from base → **anti-stale guarantee preserved**. Only the _second and later_ dispatches of a unit _within the same run_ preserve.

## Integration Points

- **Entry Points.** No new CLI/MCP/route. Internal: `WorkspaceManager.ensureWorkspace` signature/return change; `Orchestrator.dispatchIssue` reuse bookkeeping. No public API surface change (both are internal to `@harness-engineering/orchestrator`).
- **Registrations Required.** None. No barrel/export changes (neither symbol is re-exported from the package root beyond existing internal use).
- **Documentation Updates.** A short note in the orchestrator workspace/dispatch docs (or the multi-backend/staged-workflow guide) that within-run retries reuse the worktree while restarts wipe. Update the `ensureWorkspace` and `dispatchIssue` doc comments to state the reuse-on-retry contract and retire the "removes on every dispatch" wording.
- **Architectural Decisions.** D1 (in-memory dispatched-this-run set as the retry/fresh discriminator, chosen over lane-state and on-disk sentinel) warrants a standalone ADR — it establishes the retry-vs-restart boundary for workspace lifecycle and explains why lane state is unsuitable.
- **Knowledge Impact.** Concept: "within-run retry reuses the worktree; restart wipes." Relationship: retry-preserves-progress → local-model-convergence.

## Success Criteria

- **SC1** A second `dispatchIssue` for the same identifier within one run **reuses** the worktree: an uncommitted file written after the first dispatch still exists after the second. (unit/integration test with an injected git/worktree seam)
- **SC2** A genuinely fresh first dispatch **still wipes + recreates** from the base ref (existing remove→add→seed flow runs, `reused: false`). (regression test)
- **SC3** After a simulated restart (new `Orchestrator`/`WorkspaceManager` instance, empty set), an existing leftover worktree is **wiped** on its first dispatch — anti-stale guarantee holds. (test)
- **SC4** `afterCreate` and `seedWorkspace` run **only on fresh create**, not on reuse. (test asserts hook/seed call counts across a fresh-then-reuse sequence)
- **SC5** No regression: single-dispatch + unstaged workflow paths are byte-identical; all existing orchestrator + workspace tests stay green; `ensureWorkspace` callers that pass no `opts` behave exactly as before.
- **SC6** (live acceptance, post-merge) Re-running the qwen3.6 staged pilot on the `no-only-tests` item: the workspace diff **accumulates across re-dispatches** (the test file persists) and the unit converges to a verification-passing rule instead of looping.

## Implementation Order

1. **`ensureWorkspace` preserve + return shape (D2)** — failing test first (SC1 reuse, SC2 fresh-wipe, SC3 restart-wipe against the manager with an injected git seam); implement the `preserve` guard + `{ path, reused }` return; migrate internal call sites.
2. **`dispatchIssue` reuse bookkeeping (D1/D3)** — failing test first (SC4 hook/seed call counts across fresh→reuse); add the `#dispatchedThisRun` set, compute `preserve`, gate `afterCreate` on `!reused`.
3. **Docs + ADR + changeset + regression sweep (SC5)** — ADR for D1; doc-comment/guide updates; `@harness-engineering/orchestrator` minor changeset; full orchestrator + workspace suite green.
