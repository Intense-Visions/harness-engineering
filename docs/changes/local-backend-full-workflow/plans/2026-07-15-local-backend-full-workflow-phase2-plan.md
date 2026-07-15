# Plan: Local backend full workflow — Phase 2 (harness-enforced gate loop)

**Date:** 2026-07-15 | **Spec:** docs/changes/local-backend-full-workflow/proposal.md | **Tasks:** 12 | **Time:** ~52 min | **Integration Tier:** medium

> **STATUS: awaiting human approval of the enforcement-seam design decision (Option A/B/C).**
> This plan RESOLVES the fork with a concrete recommendation (**Option C — completion-gate re-dispatch**, see the decision block below) and is fully decomposed against that choice. Do not begin execution until the recommended option is confirmed. If the human picks A or B, Tasks 4–9 change materially (noted per task).

## Goal

On the LOCAL (`pi`) dispatch path, the orchestrator — not the agent's discipline — runs `verify` (typecheck+lint+test) and `outcome-eval` on the agent's introduced diff after the agent exits; a red verify or a high-confidence `NOT_SATISFIED` outcome-eval verdict BLOCKS the run from being marked complete, re-dispatches the agent with the failure text (reusing the retry budget), and escalates `needs-human` on retry-budget exhaustion.

---

## THE DESIGN FORK — RESOLVED

### Decision needed: how does the orchestrator ENFORCE the local gates such that a red gate cannot ship?

The investigation surfaced four load-bearing facts about the REAL code (all cited below in Evidence):

1. **The completion path already runs both gate engines** — but detect-only, and AMR-gated. `runAgentInBackgroundTask` (orchestrator.ts:2262-2265) calls `deriveSingleAgentQualityVerdict` (→ `deriveAcceptanceEvalVerdict`, the in-process `OutcomeEvaluator` — this IS the SC4 engine) and `deriveRoutingRetrospectiveVerdict`, combines them, and passes the class to `emitWorkerExit(..., 'normal', ..., outcomeClass)`.
2. **A `'quality-fail'` on a NORMAL exit does NOT block or re-dispatch today.** It only feeds `recordAmrOutcome` → the AMR _escalation counter_ (orchestrator.ts:2594, 2617-2627). The state machine still sees `reason: 'normal'` and treats the exit as **terminal success** — `completed.set` + `cleanWorkspace` (state-machine.ts:461-475). The floor only escalates _future_ dispatches of the same unit; it never blocks THIS ship.
3. **Both engines are gated on `adaptiveRouter !== null`** (orchestrator.ts:2302, 2407) and outcome-eval additionally on `routing.policy.acceptanceEval.enabled === true` (orchestrator.ts:2348). A plain local dispatch with no AMR policy runs NEITHER gate.
4. **The agent ships itself.** The local template (harness.orchestrator.local.md:158-177) instructs the agent to `git push` + `gh pr create`. By the time any completion verdict runs, **the PR already exists** — so a completion-time verdict cannot "not allow ship"; ship already happened.

|                                       | **A) Detect-and-escalate after the agent ships** (rely on the already-shipped retrospective + `needs-human`)                   | **B) Orchestrator CONTROLS ship** (template drops PR creation; agent stops after implement; orchestrator gates then opens the PR)                                                                                    | **C) Hybrid: completion-gate re-dispatch** (agent implements + commits; orchestrator re-runs verify+outcome-eval on the local branch and, on fail, re-dispatches via the retry budget; only a green run is marked complete)                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What it delivers vs SC3/SC4**       | FAILS the letter of SC3 ("does NOT allow ship") — the PR is already open when the verdict fires. Only escalates. No re-prompt. | Fully satisfies SC3/SC4; orchestrator is the ship authority.                                                                                                                                                         | Fully satisfies SC3/SC4: gate runs before the run is marked complete; re-prompt = re-dispatch with failure text; exhaustion → `needs-human`.                                                                                                                                                                    |
| **Invasiveness to the hot ship path** | None — reuses shipped machinery as-is.                                                                                         | HIGH — removes PR creation from the agent, adds an orchestrator-owned ship step (branch/commit/push/`gh pr create`), forks the local completion path away from the shared one. Touches the code that opens every PR. | MEDIUM — adds a local-only gate hop in `runAgentInBackgroundTask` before `emitWorkerExit`; converts a failing gate to `emitWorkerExit('error', …)` so the EXISTING state-machine retry branch re-dispatches. No change to how PRs are opened.                                                                   |
| **Reuse of shipped machinery**        | Full (retrospective + escalation).                                                                                             | Low — new ship orchestration + must still call the gate engines.                                                                                                                                                     | High — reuses `OutcomeEvaluator`/`deriveAcceptanceEvalVerdict` (SC4 engine), the `reason:'error'` → retry branch (state-machine.ts:476-518), and the `checkRetryBudget` → `escalate` → `needs-human` exhaustion path. The re-dispatch re-renders the template with `{{ attempt }}` (orchestrator.ts:2054-2057). |
| **Risk**                              | Low code risk, but does not meet the SC. Bad build ships a PR; human must catch it.                                            | High: reworks the ship path used by BOTH backends' PR flow if not carefully forked; a bug here can break shipping for good runs.                                                                                     | Medium: the new gate hop is local-branch-scoped and fully guarded (any gate error → conservative block, mirroring the shipped fail-safe pattern at 2513-2521). The retry re-render already exists; risk is contained to the local path.                                                                         |
| **Effort**                            | Low                                                                                                                            | High                                                                                                                                                                                                                 | Medium                                                                                                                                                                                                                                                                                                          |

**Recommendation: Option C (confidence: high).**

Rationale:

- **It is the only option that satisfies SC3's exact wording without reworking the shared ship path.** SC3 says the orchestrator "re-prompts with the failure and does **not** allow ship; on retry-budget exhaustion it escalates `needs-human`." Option C's re-dispatch IS the re-prompt (the template re-renders with the incremented `{{ attempt }}` and a failure preamble), and routing a gate failure through `emitWorkerExit('error', …)` reuses the shipped retry→`checkRetryBudget`→escalate path verbatim (state-machine.ts:476-518) — exhaustion already queues `needs-human`.
- **It reuses the SC4 engine directly.** `deriveAcceptanceEvalVerdict` already wraps `OutcomeEvaluator` over the introduced diff vs the spec's judgment section and maps a high-confidence `NOT_SATISFIED` to `'quality-fail'` (orchestrator.ts:2358-2373). Phase 2 lifts that verdict from _escalation-counter-only_ to _block-and-re-dispatch_ on the local path, and un-gates it from AMR for local dispatches (a `pi` backend without an AMR policy must still be gated — that is D2's whole point).
- **It keeps ship mechanics untouched.** Unlike B, the agent still opens its own PR _after_ it has reached green — but the orchestrator's gate hop runs BEFORE the completion is treated as terminal, and a failing gate short-circuits to a retry so the run is not marked complete on a red build. The "agent already pushed" window is closed by having the gate run against the **local worktree branch** on agent exit and re-dispatching before `cleanWorkspace`; a genuinely green agent that also opened a PR is the success case (identical to today's Claude path). The residual "agent opened a PR then the gate re-dispatched" corner is handled by the existing `cleanWorkspaceWithGuard` / preserved-worktree path (orchestrator.ts:1559-1611) — the re-dispatch works the same worktree.
- **Option A is rejected** because it cannot meet SC3 (no block, no re-prompt) and leaves the demonstrated failure mode — a non-compiling local build — able to open a PR. **Option B is rejected** as over-invasive: it forks PR creation out of the agent and into the orchestrator for one backend, touching the highest-blast-radius code (the ship path) to buy a property Option C gets by reusing the retry branch.

**One template correction folds in regardless of option** (Phase-1 fold-forward, confirmed): the gate command names in the template are wrong. `harness verify` verifies **branch naming only** (cli/commands/verify.ts), and `harness outcome-eval` **does not exist** as a CLI command. The real mechanical gate is the `harness-verify` skill (typecheck→lint→test) and the `outcome-eval` skill; the Claude template itself uses `harness validate` (harness.orchestrator.md:181). Task 1 corrects the template so the agent's self-run matches what the orchestrator enforces.

---

## Observable Truths (Acceptance Criteria)

Using EARS where behavioral:

1. **(SC3, event-driven)** When a local (`pi`) dispatch's introduced diff fails `verify`, the orchestrator shall re-dispatch the same unit with the verify failure text and shall NOT mark the run complete (no `completed.set`) on that attempt.
2. **(SC3, event-driven)** When the retry budget for a local unit is exhausted while a gate is still red, the orchestrator shall queue exactly one `needs-human` interaction and shall not re-dispatch.
3. **(SC3, state-driven)** While a stubbed gate is configured failing→passing, the local dispatch shall re-dispatch on the failing attempt and mark complete on the passing attempt.
4. **(SC4, unwanted)** If the local path's `outcome-eval` returns a high-confidence `NOT_SATISFIED` verdict, then the orchestrator shall NOT allow the run to complete (block with the same authority as the Claude path's `deriveAcceptanceEvalVerdict`).
5. **(structural)** The local template invokes gates using command names that actually exist and actually run typecheck+lint+test (no `harness verify`/`harness outcome-eval` non-gate names) — asserted by the lint test.
6. **(structural)** `harness.orchestrator.local.md` (repo root) and `templates/orchestrator/harness.orchestrator.local.md` are byte-identical — asserted by the lint test.
7. **(structural)** The lint test asserts the `{{ issue.* }}` and `{{ attempt }}` template variables survive verbatim in both files.
8. **(structural)** A dispatch-wiring test proves `dispatchIssue` calls `resolvePromptTemplate`, including a `pi`-backend case.
9. **(regression)** The full orchestrator suite passes (`>= 2036` prior tests + new), typecheck green, `harness check-deps` passes, `harness validate` shows only the pre-existing baseline.

Every truth traces to a task: T1→(5), T2→(6,7), T3→(8), T4→(the comment; supports future readers), T5-T7→(1,3,4), T8→(2), T9→(4 provider), T10-T11→docs/ADR, T12→(9).

## File Map

- MODIFY `harness.orchestrator.local.md` (repo root) — correct gate command names (T1)
- MODIFY `templates/orchestrator/harness.orchestrator.local.md` — byte-identical mirror of the above (T1)
- MODIFY `packages/orchestrator/src/local-template-lint.test.ts` — byte-identity guard + var-survival asserts + corrected-gate-name assert (T1, T2, T4-comment context)
- CREATE `packages/orchestrator/src/orchestrator.local-gate.test.ts` — SC3/SC4 gate-loop tests (T5, T6, T7, T8, T9)
- MODIFY `packages/orchestrator/src/orchestrator.ts` — `runLocalWorkflowGate` helper + gate hop in `runAgentInBackgroundTask` + local-path un-gating of the eval + `resolvePromptTemplate` frontmatter comment (T4, T5, T6, T7, T9)
- CREATE `packages/orchestrator/src/orchestrator.dispatch-wiring.test.ts` — proves dispatch → `resolvePromptTemplate` with a `pi` case (T3)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (render preamble) — thread a per-attempt gate-failure preamble into the re-dispatch prompt (T6)
- CREATE `docs/knowledge/decisions/NNNN-harness-enforced-local-gates.md` — ADR for D2 (T10)
- MODIFY `docs/guides/multi-backend-routing.md` — local now runs gated full workflow (T11)
- MODIFY `AGENTS.md` — orchestrator section: local enforced-gate loop (T11)

## Skeleton

1. Template + lint hardening (gate-name fix + 4 Phase-1 follow-ups) (~4 tasks, ~16 min)
2. Enforced gate loop on local completion path (verify + outcome-eval, block + re-dispatch) (~5 tasks, ~24 min)
3. Docs + ADR + validate (~3 tasks, ~12 min)

**Estimated total:** 12 tasks, ~52 min.
_Skeleton approved: pending (standard rigor, 12 tasks ≥ 8 → skeleton required before full expansion; presented for approval alongside the option decision)._

---

## Tasks

### Task 1: Correct the local template's gate command names (both copies)

**Depends on:** none | **Files:** `harness.orchestrator.local.md`, `templates/orchestrator/harness.orchestrator.local.md`

The template tells the agent to run `harness verify` (branch-naming only — cli/commands/verify.ts:114) and `harness outcome-eval` (nonexistent). Replace with commands that actually run the mechanical gate and match what the orchestrator enforces.

1. In `harness.orchestrator.local.md`, replace the "## Gates (bash — enforced)" body (lines ~143-156) so the gate bullets read:
   - `harness validate` — project conventions/health (same command the Claude template uses).
   - Detect and run the project's typecheck, lint, and test commands directly (from `package.json` scripts / Makefile), e.g. `pnpm -w typecheck && pnpm -w lint && pnpm -w test` — fix every failure and re-run until green. (This is what the `harness-verify` skill does; the local agent has no slash commands, so it runs the underlying commands.)
   - Keep the "**These gates are also enforced by the harness itself**" paragraph — it is now literally true (Phase 2 enforces them).
2. Update the "## Ship" precondition line and the "## Rules" line that reference `harness verify` to say `harness validate` + the typecheck/lint/test run.
3. Copy the file byte-for-byte to `templates/orchestrator/harness.orchestrator.local.md` (`cp harness.orchestrator.local.md templates/orchestrator/harness.orchestrator.local.md`).
4. Run: `node packages/cli/dist/bin/harness.js validate` (expect baseline-only).
5. Commit: `fix(orchestrator): correct local template gate command names to real gates`

> **[checkpoint:human-verify]** Show the diff of the Gates section. The exact typecheck/lint/test command phrasing is a judgment call (generic detection vs this-repo `pnpm -w …`); confirm the wording keeps the template portable to adopter projects (per the "harness features are adopter-portable" constraint) rather than hardcoding this repo's scripts. Wait for confirmation.

### Task 2: Lint test — byte-identity guard + corrected-gate-name assert

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/local-template-lint.test.ts`

Fold-in (1): the lint test does not currently prove the two copies are byte-identical.

1. Read the existing lint test to confirm its current shape and the two file paths it loads.
2. Add a test: read both `harness.orchestrator.local.md` (repo root) and `templates/orchestrator/harness.orchestrator.local.md` with `fs.readFileSync(..., 'utf8')` and assert `expect(rootContent).toBe(templateContent)` (byte-identity guard).
3. Add/adjust the gate-name assertions: assert NEITHER file contains the standalone token `harness verify` or `harness outcome-eval` (the corrected names), and DO contain `harness validate`. (Keep the existing no-`/harness:` slash-command assert.)
4. Run: `npx vitest run packages/orchestrator/src/local-template-lint.test.ts` — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `test(orchestrator): guard local-template byte-identity + corrected gate names`

### Task 3: Lint test — assert template variables survive

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/local-template-lint.test.ts`

Fold-in (2): prove the `{{ issue.* }}` / `{{ attempt }}` mustache vars are not accidentally stripped.

1. Add a test asserting both files contain the literal substrings `{{ issue.title }}`, `{{ issue.identifier }}`, `{{ issue.description }}`, and `{{ attempt }}` (the render contract at orchestrator.ts:2054-2057 supplies `issue` + `attempt`).
2. Run: `npx vitest run packages/orchestrator/src/local-template-lint.test.ts` — observe pass.
3. Commit: `test(orchestrator): assert local template render vars survive`

### Task 4: Frontmatter-ignored comment + dispatch-wiring test

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/orchestrator.dispatch-wiring.test.ts`

Fold-in (3) + (4). The local template carries a full frontmatter block (harness.orchestrator.local.md:1-119) that the dispatch renderer never reads (only the body is rendered as the prompt; config comes from the loaded `WorkflowConfig`).

1. In `orchestrator.ts`, above `resolvePromptTemplate` (line ~1837), add a doc comment: the local template's YAML frontmatter is **intentionally ignored** at dispatch — only the markdown body is rendered as the prompt; the frontmatter exists solely so the file is a valid scaffold that `harness init` can drop in, and configuration is read from the loaded `WorkflowConfig`, never from this file's frontmatter.
2. CREATE `packages/orchestrator/src/orchestrator.dispatch-wiring.test.ts` (fold-in 3): a test that spies `resolvePromptTemplate` on an Orchestrator instance (cast-to-access the private method, matching the pattern in `orchestrator.quality-verdict.test.ts:118-122`), dispatches an issue routed to a `pi`-type backend via `dispatchIssue`, and asserts `resolvePromptTemplate` was called with the resolved `pi` backend name. Reuse the `MockBackend`/`makeConfig`/`overrideBackend` harness from the existing tests. Include a second case for a non-`pi` backend to prove the resolver receives the correct name in both branches.
3. Run: `npx vitest run packages/orchestrator/src/orchestrator.dispatch-wiring.test.ts` — observe pass.
4. Run: `node packages/cli/dist/bin/harness.js validate`.
5. Commit: `test(orchestrator): prove dispatch calls resolvePromptTemplate (pi + default) + document ignored frontmatter`

### Task 5 (TDD): Local gate helper — verify gate blocks + returns re-dispatch reason

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`, `packages/orchestrator/src/orchestrator.ts`

> **If the human chose Option A instead of C:** this task becomes "escalate-only" (no re-dispatch return) and Task 6 is dropped. **If Option B:** this task moves the gate BEFORE PR creation in a new orchestrator-owned ship step. This task as written implements **Option C**.

Introduce a private `runLocalWorkflowGate(issue, workspacePath, backendName): Promise<{ ok: true } | { ok: false; reason: string }>` that runs ONLY for local (`pi`) dispatches and returns a blocking failure with a human-readable reason string when a gate is red.

1. Write the test first in `orchestrator.local-gate.test.ts`:
   - Harness mirrors `orchestrator.quality-verdict.test.ts` (MockBackend, `makeConfig`, `noopExecFile`, tmpDir, `stubDiff`/`stubDiffText`, `stubProvider`, `writeSpec`).
   - Add a `stubVerify(orch, impl)` helper that injects a fake verify runner onto the orchestrator (the gate helper must accept an injectable verify function so the test can force fail→pass — mirror how `execFileFn` is injected at construction, orchestrator.quality-verdict.test.ts:102).
   - Test A: `pi` backend, verify stubbed FAIL → `runLocalWorkflowGate` resolves `{ ok: false, reason: <contains the verify failure text> }`.
   - Test B: `pi` backend, verify stubbed PASS + no spec → `{ ok: true }`.
   - Test C: NON-`pi` backend → `runLocalWorkflowGate` resolves `{ ok: true }` unconditionally (guard: gate is local-only; the Claude path keeps its existing behavior).
2. Run the test — observe failures (method absent).
3. Implement `runLocalWorkflowGate` in `orchestrator.ts` (near `deriveSingleAgentQualityVerdict`, ~2298):
   - Guard: if the resolved backend `def.type` is not `pi`/`local` → return `{ ok: true }`.
   - Run the injected/real verify over the workspace; on failure return `{ ok: false, reason: 'verify failed:\n' + <captured output, truncated> }`.
   - (Outcome-eval added in Task 7.)
   - Fully guarded: any thrown error → conservative block `{ ok: false, reason: 'gate error: ' + msg }`, mirroring the shipped fail-safe pattern (orchestrator.ts:2513-2521).
4. Run the test — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `feat(orchestrator): add local-only runLocalWorkflowGate (verify gate, blocking)`

### Task 6 (TDD): Wire the gate into completion — block + re-dispatch on fail

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`, `packages/orchestrator/src/orchestrator.ts`

Route a failing local gate through the EXISTING `emitWorkerExit('error', …)` retry branch so the state machine re-dispatches (re-prompt) rather than marking the run complete.

1. Extend the test:
   - Test D (SC3 core): `pi` dispatch, verify stubbed FAIL on attempt 1. Drive `runAgentInBackgroundTask`'s completion (or the extracted seam it calls) and assert `emitWorkerExit` was invoked with `reason: 'error'` and an `error` string containing the gate reason — NOT `reason: 'normal'` (so the state machine does not `completed.set`). Spy `emitWorkerExit` via the private-access cast.
   - Test E (SC3 failing→passing): a stubbed gate that fails on attempt 1 and passes on attempt 2; assert attempt 1 → `emitWorkerExit('error', …, attempt=1)` and attempt 2 → `emitWorkerExit('normal', …)`.
   - Test F: assert the re-dispatch prompt for attempt 2 includes the failure preamble (render receives the prior reason). Spy `renderer.render` and assert the failure text is threaded in.
2. Run — observe failures.
3. Implement in `orchestrator.ts`:
   - In the normal-exit branch of `runAgentInBackgroundTask` (orchestrator.ts:2246-2266), BEFORE computing `outcomeClass`/calling `emitWorkerExit('normal', …)`, call `await this.runLocalWorkflowGate(issue, workspacePath, routedBackendName)`. (Thread `routedBackendName` into `runAgentInBackgroundTask` — it is available at the dispatch site; pass it through or read it from the running entry's `session.backendName`.)
   - If `!gate.ok`: call `emitWorkerExit(issue.id, 'error', attempt, gate.reason)` and `return` (skip the normal-exit path). The shipped state-machine `else` branch (state-machine.ts:476-518) computes `nextAttempt`, checks `checkRetryBudget`, and either enqueues a retry (re-dispatch) or escalates.
   - Thread the gate reason into the re-dispatch prompt: store the last gate-failure reason on the running entry (or a per-issue map) and, in the render call (orchestrator.ts:2054), prepend it as a `priorGateFailure` context var when present. Add a one-line block to the local template body only if needed (a `{{#if priorGateFailure}}` is not supported by the current renderer — instead inject the reason into `issue.description` append or a dedicated preamble string the renderer already interpolates; confirm the renderer's variable surface first and prefer the least-invasive threading).
4. Run — observe pass. Run the FULL suite: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts packages/orchestrator/src/orchestrator.quality-verdict.test.ts` to confirm no regression to the sibling AMR verdict path.
5. Run: `node packages/cli/dist/bin/harness.js validate` and `node packages/cli/dist/bin/harness.js check-deps`.
6. Commit: `feat(orchestrator): block+re-dispatch local dispatch on failed workflow gate (SC3)`

### Task 7 (TDD): Add outcome-eval to the local gate (SC4)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`, `packages/orchestrator/src/orchestrator.ts`

Give the local gate the SAME outcome-eval authority as the Claude path by reusing `deriveAcceptanceEvalVerdict`'s engine, un-gated from the AMR requirement for local dispatches.

1. Extend the test:
   - Test G (SC4): `pi` dispatch, verify stubbed PASS, spec present, `stubProvider` returns a high-confidence `NOT_SATISFIED` verdict → `runLocalWorkflowGate` resolves `{ ok: false, reason: <contains 'outcome-eval' / 'NOT_SATISFIED'> }`, and the completion path emits `emitWorkerExit('error', …)` (blocks, does not complete).
   - Test H: same but `SATISFIED` (or low-confidence) → `{ ok: true }` → normal completion.
2. Run — observe failures.
3. Implement: in `runLocalWorkflowGate`, after a green verify, when `issue.spec` is present, run the outcome-eval. Extract the eval core from `deriveAcceptanceEvalVerdict` (orchestrator.ts:2344-2381) into a shared private that does NOT require `adaptiveRouter !== null` and does NOT require `acceptanceEval.enabled` — the local gate always evaluates when a spec exists (that is D2). Reuse `resolveComplexityProvider()`, `OutcomeEvaluator`, and `outcomeVerdictToQualityFail`. Map a `'quality-fail'` to `{ ok: false, reason }`. Leave the existing `deriveAcceptanceEvalVerdict` (AMR-gated, escalation-counter path) intact for the Claude/AMR path — Phase 2 adds a local caller, it does not remove the existing one.
4. Run — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`.
6. Commit: `feat(orchestrator): local gate enforces outcome-eval NOT_SATISFIED as blocking (SC4)`

### Task 8 (TDD): Exhaustion → needs-human on the local gate path

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`

Prove SC3's tail: a persistently-red local gate escalates `needs-human` when the retry budget is spent, and does not re-dispatch again.

1. Extend the test: `pi` dispatch, verify stubbed to ALWAYS fail, `maxRetries` (or `diagnosticRetryBudget` for a `scope:diagnostic`-labelled issue) small. Drive completion across attempts up to budget+1 and assert: (a) each pre-exhaustion attempt enqueues a retry effect; (b) the exhausting attempt pushes exactly one `escalate`/`needs-human` effect (via `checkRetryBudget`, state-machine.ts:494-506) and NO further retry. Assert against the effects returned by `applyEvent`/`emitWorkerExit`, reusing the state-machine assertion style already in the orchestrator tests.
2. Run — observe pass (this exercises the SHIPPED retry/escalation branch; if it fails, the wiring in Task 6 did not route through `reason:'error'`).
3. Run: `node packages/cli/dist/bin/harness.js validate`.
4. Commit: `test(orchestrator): local gate exhaustion escalates needs-human (SC3)`

### Task 9 (TDD): Guard — local gate is a no-op when disabled / non-pi (byte-identical default)

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`, `packages/orchestrator/src/orchestrator.ts`

Ensure the new gate hop cannot regress the existing Claude/AMR completion path.

1. Extend the test:
   - Non-`pi` dispatch → `runLocalWorkflowGate` returns `{ ok: true }` and the completion path is byte-identical to today (still runs `deriveSingleAgentQualityVerdict` + `deriveRoutingRetrospectiveVerdict`, still `emitWorkerExit('normal', …, outcomeClass)`). Assert the sibling verdict functions are still called for the Claude path (spy them).
   - Local dispatch with verify PASS + no spec → `{ ok: true }` → normal completion, and the AMR sibling verdicts still run (composition, per spec "composes with the already-shipped retrospective as a second layer").
2. Run — observe pass (add the guard in `runLocalWorkflowGate` / the completion hop if the composition assert fails).
3. Run the FULL orchestrator suite: `npx vitest run packages/orchestrator/src` — confirm `>= 2036` prior tests still pass, 0 fail.
4. Run: `node packages/cli/dist/bin/harness.js validate` and `check-deps`.
5. Commit: `test(orchestrator): local gate composes with AMR verdicts, no-op on non-pi (regression guard)`

### Task 10: ADR for D2 (harness-enforced local gates)

**Depends on:** Task 9 | **Files:** `docs/knowledge/decisions/NNNN-harness-enforced-local-gates.md` | **Category:** integration

Derived from the spec's Integration Points → Architectural Decisions ("D2 … warrants an ADR").

1. Determine the next ADR number: `ls docs/knowledge/decisions/ | sort | tail -3` and pick `NNNN` = highest + 1.
2. Write the ADR: context (local backend cannot self-discipline; demonstrated skip-verify failure mode), decision (Option C — orchestrator runs verify+outcome-eval on the local branch at completion, blocks via `emitWorkerExit('error')` → shipped retry/escalation), consequences (reuses the retry budget + `needs-human`; local-only guard; composes with the AMR retrospective; the gate command names in the template are the real gates). Reference the rejected Options A/B and why.
3. Run: `node packages/cli/dist/bin/harness.js validate`.
4. Commit: `docs(knowledge): ADR for harness-enforced local workflow gates (D2)`

### Task 11: Docs — multi-backend guide + AGENTS.md

**Depends on:** Task 10 | **Files:** `docs/guides/multi-backend-routing.md`, `AGENTS.md` | **Category:** integration

Derived from Integration Points → Documentation Updates.

1. In `docs/guides/multi-backend-routing.md`, add a subsection: the local backend now runs the full workflow gated — the orchestrator enforces verify + outcome-eval on the local branch at completion, re-dispatches on failure, halts to a human on exhaustion. Note the gate provider defaults to local (Phase 3 adds the `workflowGates` routing flag).
2. In `AGENTS.md`, update the orchestrator section to describe the enforced local-gate loop (one paragraph).
3. Run: `node packages/cli/dist/bin/harness.js validate`.
4. Commit: `docs: local backend runs the gated full workflow (Phase 2)`

### Task 12: Final full build + verify + validate

**Depends on:** Task 11 | **Files:** none (verification only)

1. Full build: `pnpm -w build` (types → orchestrator → cli).
2. Full orchestrator suite: `npx vitest run packages/orchestrator/src` — assert 0 fail, `>= 2036` prior + new tests.
3. Typecheck: `pnpm -w typecheck` (or the repo's per-package typecheck) — green.
4. Run: `node packages/cli/dist/bin/harness.js check-deps` — passes.
5. Run: `node packages/cli/dist/bin/harness.js validate` — grep the output for the Phase-2 file paths to confirm ZERO new issues (baseline-relative, per the Phase-1 learning).
6. No commit (verification only). If any step fails, fix in a follow-up task rather than proceeding.

---

## Changes (delta vs shipped behavior)

- **[MODIFIED]** Local template gate commands: `harness verify`/`harness outcome-eval` → `harness validate` + direct typecheck/lint/test (real gates).
- **[ADDED]** `runLocalWorkflowGate` — local-only, blocking verify + outcome-eval on the completion path.
- **[MODIFIED]** `runAgentInBackgroundTask` local-exit branch: a failed gate emits `emitWorkerExit('error', …)` (re-dispatch) instead of `'normal'` (complete).
- **[ADDED]** Local outcome-eval enforcement un-gated from the AMR-active + `acceptanceEval.enabled` requirements (local dispatches always evaluate when a spec exists).
- **[UNCHANGED]** The Claude/AMR completion path (`deriveSingleAgentQualityVerdict` + retrospective + escalation-counter feed) — the local gate composes with it, does not replace it.

## Uncertainties

- **[ASSUMPTION]** The renderer (`this.renderer.render`) interpolates only the `issue` + `attempt` vars it is given (orchestrator.ts:2054-2057) and has no conditional (`{{#if}}`) support. Task 6 threads the gate-failure preamble via the least-invasive available var; if the renderer supports richer templating, prefer a dedicated `priorGateFailure` var. Confirm the renderer surface at the start of Task 6. If it cannot thread extra context, Task 6 falls back to appending the reason to the rendered prompt string post-render.
- **[ASSUMPTION]** Running `verify` (typecheck+lint+test) inside the orchestrator's completion path against the workspace is acceptable latency for a local dispatch (D1 accepts halting over shipping cleanup tax). If the operator needs the gate to be async/streamed, that is a Phase 3 concern.
- **[DEFERRABLE]** The exact typecheck/lint/test detection the orchestrator's verify hop uses (reuse the `harness-verify` skill's detection logic vs a thin project-script probe). Task 5 injects a verify function so the test is decoupled; the concrete detector can be finalized during T5 implementation.
- **[DEFERRABLE]** Provider routing for the local outcome-eval (Phase 3's `workflowGates` flag). Phase 2 uses `resolveComplexityProvider()` (local SEL default), matching the shipped `deriveAcceptanceEvalVerdict`.

## Session State touched

- `decisions`: record the Option-C resolution + the template gate-name correction.
- `constraints`: local gate must be local-only (no Claude-path regression); adopter-portable template wording.
- `risks`: latency of an in-completion verify run; renderer var-threading limits.
- `evidence`: file:line citations below.

## Evidence

- Completion runs both verdict engines detect-only: `packages/orchestrator/src/orchestrator.ts:2246-2266`.
- `'quality-fail'` feeds the escalation counter, not a block: `orchestrator.ts:2594`, `orchestrator.ts:2617-2627`.
- Normal exit is terminal success (`completed.set` + `cleanWorkspace`): `packages/orchestrator/src/core/state-machine.ts:461-475`.
- `reason:'error'` → retry/`checkRetryBudget`/escalate branch: `state-machine.ts:476-518`, `state-machine.ts:138-156`.
- Outcome-eval engine (SC4) + AMR gating: `orchestrator.ts:2344-2381` (`deriveAcceptanceEvalVerdict`), gated `orchestrator.ts:2302`, `orchestrator.ts:2348`.
- Agent self-ships (push + PR): `harness.orchestrator.local.md:158-177`.
- Fail-safe conservative-block pattern to mirror: `orchestrator.ts:2513-2521`.
- Render call supplies `issue` + `attempt`: `orchestrator.ts:2054-2057`.
- `resolvePromptTemplate` (Phase 1): `orchestrator.ts:1837-1844`.
- `harness verify` = branch-naming only: `packages/cli/src/commands/verify.ts:114`; `harness outcome-eval` CLI absent (skill-only): `agents/skills/claude-code/outcome-eval/`, `harness-verify` skill runs typecheck→lint→test: `agents/skills/claude-code/harness-verify/SKILL.md:3,28-40`; Claude template uses `harness validate`: `harness.orchestrator.md:181`.
- Preserved-worktree/needs-human on pushed-branch-no-PR: `orchestrator.ts:1559-1611`.
- Retry budget config (`diagnosticRetryBudget`, `maxRetries`): `state-machine.ts:481-488`.

## Success Criteria (plan-level)

- Plan committed under `docs/changes/local-backend-full-workflow/plans/`.
- Every task ≤ one context window with exact paths, code intent, and commands.
- Every code task is TDD (test → fail → implement → pass).
- SC3 + SC4 each trace to specific tasks (T5-T9).
- Human has approved BOTH the Option-C decision and the plan.
