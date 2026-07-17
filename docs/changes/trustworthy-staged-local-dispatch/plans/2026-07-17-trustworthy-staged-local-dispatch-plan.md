# Plan: Trustworthy Staged Local Dispatch

**Date:** 2026-07-17 | **Spec:** `docs/changes/trustworthy-staged-local-dispatch/proposal.md` | **Tasks:** 14 | **Time:** ~58 min | **Integration Tier:** medium

## Goal

Bring #843's trustworthiness guarantees (empty-diff halt, correct per-phase routing, a completion-driving stage prompt) to the STAGED-workflow dispatch path in `packages/orchestrator`, so a staged local unit that produces zero artifacts halts visibly instead of being marked `success → done`.

## Observable Truths (Acceptance Criteria)

1. **SC3** — Given a config where `routing.default` ≠ the reasoner backend, a staged execution stage (`WorkflowStep` with NO `cognitiveMode`) routed through `AdaptiveRouter.route` / the stage-backend selection resolves to `routing.default`, NOT the reasoner. (failing-test-first unit test)
2. **SC4** — Given `cognitiveMode: 'thinking'`, the stage still resolves to `routing.modes.thinking` (no #876 regression). (unit test, pinned alongside SC3)
3. **SC1** — When a staged unit's stages produce an empty workspace git diff (`hasChanges: false`), the completion path does NOT call `persistLane('success')`; it routes to the existing unit retry/`needs-human` escalation path with a `'no changes produced'` reason. (unit test on the staged completion path)
4. **SC2** — When a staged unit's diff is non-empty (`hasChanges: true`), the unit completes exactly as today (`persistLane('success')` called once). (regression unit test)
5. **SC5** — `LOCAL_STAGE_PROMPT_TEMPLATE` renders under LiquidJS `strictVariables` with a new `produces` variable, drives the model to PRODUCE the stage's declared output (not "run then stop"), keeps byte-identical `<<<BEGIN>>>/<<<END>>>` prior-stage fencing, and both `STAGE_PROMPT_TEMPLATE` and `LOCAL_STAGE_PROMPT_TEMPLATE` share an identical variable set. `local-stage-prompt.test.ts` stays green (updated only where drive wording changed).
6. **SC6 (HARD)** — Unstaged workflows and the single-dispatch path are byte-identical to today: the existing `orchestrator.local-gate.test.ts` single-dispatch empty-diff tests (`:342-378`) stay green untouched; the non-local `STAGE_PROMPT_TEMPLATE` is unchanged for non-local rendering; the staged gate fires ONLY on the staged completion path.
7. Docs: `docs/guides/multi-backend-routing.md` carries a note on the staged empty-diff halt + execution-stage → `routing.default`.
8. ADR: a new `docs/knowledge/decisions/NNNN-*.md` records D1 (staged empty-diff halt extends the #843 trustworthiness invariant).
9. Changeset: a `minor` bump for `@harness-engineering/orchestrator` exists.

## Evidence (file:line anchors)

- `BackendRouter.resolve` step 1 (invocation override short-circuits ALL other steps): `packages/orchestrator/src/agent/backend-router.ts:136-141`. Step 5 default fallback: `:168-170`. `resolveExistingUseCase` returns `undefined` for `kind:'skill'`: `:231` (switch has no `'skill'` case).
- **Routing root cause (verified):** `AdaptiveRouter.route` computes `target = this.selectTarget(requiredTier, req)` (`packages/orchestrator/src/agent/adaptive-router.ts:299`), then calls `resolveDecisionAndDef(req.useCase, { invocationOverride: target })` (`:300-302`). `selectTarget` → `selectCheapestQualifying(registry, tier, …)` (`:363-370`) returns the cheapest tier-qualifying backend by NAME. That name becomes `invocationOverride`, which short-circuits `BackendRouter.resolve` step 1 — so a no-`cognitiveMode` skill stage NEVER reaches step 5 `routing.default`; it lands on whatever tier-qualifying backend `selectCheapestQualifying` picked (the reasoner in the pilot). This is the mis-route.
- The SECOND routing decision the pilot saw (`useCase kind 'workflow-stage'`): `makeRunnerFactory` re-materializes with the hardcoded `{ kind:'skill', skillName:'workflow-stage' }` useCase BUT `invocationOverride: backend.name` (`packages/orchestrator/src/workflow/orchestrator-context.ts:161-165`) — it is pinned to the already-resolved name, so it does not itself pick the backend; it only emits a second decision log line. The backend-driving decision is `route()`'s.
- `buildStageRequest` useCase derivation: `packages/orchestrator/src/workflow/execute-workflow.ts:163-186`. `runStageWithRetry` calls `ctx.adaptiveRouter.route(req)` (`:378`) and the returned `decision.backendName` drives the backend (`:382`).
- **#843 diff seam:** `this.diffRunner` is a constructor-injected class field (`packages/orchestrator/src/orchestrator.ts:438`, defaulted `:676` to `defaultLocalDiffRunner`; concrete detector `:329-344`). Consumed by `runLocalWorkflowGate` empty-diff halt (`:2624-2630`). Test injects it via the 5th `newOrch` arg (`orchestrator.local-gate.test.ts:126-137`).
- **Staged completion path:** `settleWorkflowSuccess(unit, runs)` (`packages/orchestrator/src/orchestrator.ts:3261-3280`) marks the unit done with NO diff check — `persistLaneSafe(unit, 'success')` at `:3274`. It reads the running entry: `const entry = this.state.running.get(unit)` (`:3262`); the entry carries `workspacePath` (set at `:2194`). `settleWorkflowTerminal` (`:3296+`) is the existing terminal/`needs-human` escalation path (`persistLaneSafe(unit,'abandon')` `:3307` + one `needs-human` push `:3308-3314`).
- **Engine terminal wiring:** `executeWorkflow` calls `ctx.emitWorkflowSuccess(unit, runs)` on all-stages-pass (`packages/orchestrator/src/workflow/execute-workflow.ts:482`) and `ctx.finalizeWorkflowTerminal(...)` on stage failure/throw (`:479, :486`). `settleSuccess`/`settleTerminal` are bound at `orchestrator.ts:2186-2187`.
- **Stage prompt:** `LOCAL_STAGE_PROMPT_TEMPLATE` (`packages/orchestrator/src/workflow/local-stage-prompt.ts:20-47`) — "Complete THIS stage's task, then stop" (`:20`), "follow its output VERBATIM" (`:29`). `STAGE_PROMPT_TEMPLATE` is the default (imported `:1`). `renderStagePromptFactory` builds the variable bag (`packages/orchestrator/src/workflow/orchestrator-context.ts:194-217`): `stageNumber, identifier, title, description, skill, cognitiveMode, priorEntries`.
- **Pinned template tests:** `packages/orchestrator/src/workflow/local-stage-prompt.test.ts` (asserts variable set + indirection wording). `packages/orchestrator/src/local-template-lint.test.ts` lints `harness.orchestrator.local.md` (the `.md` indirection doc — `:34-43`), NOT the TS `LOCAL_STAGE_PROMPT_TEMPLATE`.

## Uncertainties

- **[ASSUMPTION]** The routing fix belongs in `AdaptiveRouter` (make a no-`cognitiveMode` skill stage NOT hand `selectTarget`'s tier-pick to `invocationOverride`, so `resolve()` falls to `routing.default`), rather than in `buildStageRequest`. Task 2's failing test is written against the observable behavior (`route()` result), so the fix can land in whichever layer the test proves — the exact site is confirmed during Task 3 (root-cause) but the assertion is layer-agnostic. If the pilot's `route()` was NOT AMR-active (no policy → `AdaptiveRouter` never constructed, identity path `resolveStageBackend` used), the fix instead lives in `resolveStageBackendFactory`/`buildStageUseCase`; Task 2's test covers both by asserting through the same `route`/stage-selection seam the engine uses. **Task 2 must reproduce the mis-route BEFORE writing the fix; if the failing test does not reproduce, STOP and escalate — the root cause differs from this hypothesis.**
- **[ASSUMPTION]** `settleWorkflowSuccess` can reuse `this.diffRunner` reading `entry.workspacePath`. Confirmed: the running entry carries `workspacePath` (`:2194`) and `diffRunner` is a class field. If `entry` is `undefined` at settle time (already-deleted race), the gate must fail-OPEN (treat as `hasChanges: true`, do not block) to preserve SC2 — do NOT halt a unit we cannot diff.
- **[ASSUMPTION]** Only the local/staged path halts on empty diff. The staged gate must scope to the SAME locality predicate the single-dispatch gate uses (`isLocalEndpointBackend` on the routed backend def) so a non-local staged unit is byte-identical (SC6). The stage runs record `decision.backendName`; the settle path derives locality from the last stage's backend def via `this.config.agent.backends?.[name]`.
- **[DEFERRABLE]** Exact `'no changes produced'` reason wording — mirror #843's `'no changes produced — the agent completed without implementing anything'` (`orchestrator.ts:2628`).
- **[DEFERRABLE]** ADR number — next free integer after `0074` (likely `0075`), resolved at Task 12.

## File Map

- MODIFY `packages/orchestrator/src/agent/adaptive-router.ts` (routing fix — Task 3; site confirmed by Task 2/3 root-cause)
- MODIFY `packages/orchestrator/src/agent/adaptive-router.test.ts` (SC3/SC4 failing test — Task 2) — _or_ a new sibling test file if the mis-route reproduces only through the workflow seam (decided in Task 2)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (staged empty-diff gate in `settleWorkflowSuccess` — Task 6)
- MODIFY `packages/orchestrator/src/orchestrator.local-gate.test.ts` (SC1/SC2 staged-completion failing test + regression — Tasks 5, 7)
- MODIFY `packages/orchestrator/src/workflow/orchestrator-context.ts` (thread `produces` into `renderStagePromptFactory` + `STAGE_PROMPT_TEMPLATE` var set — Tasks 9, 10)
- MODIFY `packages/orchestrator/src/workflow/local-stage-prompt.ts` (thread `produces` + drive wording into `LOCAL_STAGE_PROMPT_TEMPLATE` — Task 10)
- MODIFY `packages/orchestrator/src/workflow/local-stage-prompt.test.ts` (SC5 — Tasks 9, 10)
- VERIFY-ONLY `packages/orchestrator/src/local-template-lint.test.ts` (lints the `.md` doc, not the TS template — should stay green with no edit; Task 11 verifies)
- MODIFY `docs/guides/multi-backend-routing.md` (staged empty-diff + execution→default note — Task 12)
- CREATE `docs/knowledge/decisions/00NN-staged-empty-diff-halt.md` (ADR for D1 — Task 13)
- CREATE `.changeset/trustworthy-staged-local-dispatch.md` (minor bump — Task 14)

**Do NOT touch:** `workflowGates` read site (`orchestrator.local-gate.test.ts:196-209` `newOrchWithGates`); the single-dispatch `runLocalWorkflowGate` empty-diff halt (`orchestrator.ts:2620-2630`) and its tests (`orchestrator.local-gate.test.ts:342-378`). Tasks 6/7 add a SEPARATE staged check; they must not edit the single-dispatch gate.

## Skeleton

_Task count (14) ≥ threshold (8) → skeleton produced (standard rigor)._

1. Routing fix — D4/SC3/SC4 (~4 tasks, ~18 min)
2. Staged empty-diff gate — D1–D3/SC1/SC2 (~4 tasks, ~18 min)
3. Stage-prompt drive — D5/SC5 (~3 tasks, ~13 min)
4. Docs + ADR + changeset + SC6 regression sweep (~3 tasks, ~9 min)

**Estimated total:** 14 tasks, ~58 minutes. _Skeleton approved: pending._

---

## Tasks

### Group 1 — Routing fix (D4 / SC3 / SC4)

#### Task 1: Establish the routing-fix test harness baseline

**Depends on:** none | **Files:** `packages/orchestrator/src/agent/adaptive-router.test.ts` (read only)

1. Read `packages/orchestrator/src/agent/adaptive-router.test.ts` in full to learn the existing `route()` test setup: how `AdaptiveRouter` is constructed (deps: `router`, `policy`, `registry`, `providerOf`, `escalation`), how a `BackendRouter` + `backends` map + `routing` config is assembled, and how `selectCheapestQualifying`'s registry is seeded. Identify the smallest existing test that routes a `{ kind:'skill', skillName }` useCase so Task 2 can copy its scaffold.
2. Read `packages/orchestrator/src/agent/adaptive-router.ts:250-371` (`route` + `selectTarget` + `buildConstraints`) to confirm the `invocationOverride` handoff.
3. No code change. Run: `node packages/cli/dist/bin/harness.js validate` (baseline; note the pre-existing dashboard-color + orchestrator-context↔local-stage-prompt circular-dep findings are UNRELATED to this work).
4. No commit (research task).

#### Task 2: FAILING test — no-cognitiveMode execution stage must resolve to routing.default (SC3) + design stage pins routing.modes.thinking (SC4)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/adaptive-router.test.ts`

1. Add a `describe('per-phase routing: no-mode stage → routing.default (SC3/SC4)')` block. Using the scaffold from Task 1, construct an `AdaptiveRouter` whose:
   - `backends` map has at least `reasoner` (tier `strong`, higher cost) and a distinct `default` backend (e.g. `coder`, tier `fast`), plus a registry seeding `selectCheapestQualifying` such that the derived tier for a no-hint execution stage would pick `reasoner` (reproduce the pilot: no `routingHint`, so `classifySafe`/`deriveRequiredTier` lands on a tier the reasoner qualifies for).
   - `routing.default = 'coder'` (≠ `reasoner`), `routing.modes.thinking = 'reasoner'`, NO `routing.skills` entry for the execution skill.
2. **SC3 case:** build `req = buildStageRequest({ skill:'harness-execution' /* no cognitiveMode */ }, 'unit-1', [])` (import `buildStageRequest` from `../workflow/execute-workflow.js`), call `const { decision } = await router.route(req)`, assert `expect(decision.backendName).toBe('coder')`. **This MUST fail** (current code returns `'reasoner'` via `selectTarget`→`invocationOverride`).
3. **SC4 case (add now so it's pinned before the fix):** build `req2 = buildStageRequest({ skill:'harness-brainstorming', cognitiveMode:'thinking' }, 'unit-1', [])`, assert `expect((await router.route(req2)).decision.backendName).toBe('reasoner')`. This should PASS now (per-mode step 3 fires) and must stay green after the fix.
4. Run: `npx vitest run packages/orchestrator/src/agent/adaptive-router.test.ts -t 'per-phase routing'` — observe SC3 FAILS (got `reasoner`, expected `coder`), SC4 PASSES.
   - **GATE:** if SC3 does NOT fail (already returns `coder`), STOP and escalate — the mis-route is not in `AdaptiveRouter`; re-derive the root cause (it is then in `resolveStageBackendFactory`/identity path) and revise Tasks 3.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `test(orchestrator): failing test for no-mode staged execution mis-route to reasoner (SC3/SC4)`

#### Task 3: Root-cause + fix — no-cognitiveMode skill stage falls to routing.default

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/agent/adaptive-router.ts`

1. Root-cause confirmation (already anchored `:299-302`): `selectTarget` returns the tier-cheapest backend name and it is passed as `invocationOverride`, which short-circuits `BackendRouter.resolve` step 1 — bypassing step 5 `routing.default` for a skill useCase that has no per-skill/per-mode override.
2. Fix: make the AMR tier-selection NOT override the per-phase split for a bare skill useCase. In `route()`, when the useCase is `kind:'skill'` with NO `cognitiveMode` AND no `routing.skills[skillName]` entry (i.e. the useCase would otherwise fall to `routing.default`), do NOT pass `selectTarget`'s result as `invocationOverride`; let `resolveDecisionAndDef(req.useCase)` resolve through the normal chain to `routing.default`. Concretely: gate the `invocationOverride` spread so a "should-default" skill useCase omits it. Preserve AMR tier selection for tier/intelligence/mode/per-skill useCases (do not regress AMR). Keep `estimateCost`/accrual using the resolved `def`.
   - Implementation note: expose a small predicate (e.g. `wouldFallToDefault(useCase, routing)`) — a skill useCase with no `cognitiveMode` and no matching `routing.skills` key. Add it as a local helper; do NOT widen `BackendRouter`'s public surface.
   - Do NOT touch `makeRunnerFactory`'s hardcoded `workflow-stage` useCase — it is pinned by `invocationOverride: backend.name` and only emits a second decision log; leave it.
3. Run: `npx vitest run packages/orchestrator/src/agent/adaptive-router.test.ts` — SC3 now PASSES, SC4 still PASSES, all pre-existing `route()` tests stay green.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Run: `node packages/cli/dist/bin/harness.js check-deps` (confirm no NEW cycle introduced; the pre-existing orchestrator-context↔local-stage-prompt cycle is untouched by this file)
6. Commit: `fix(orchestrator): route no-mode staged execution stages to routing.default not the reasoner (D4/SC3)`

#### Task 4: Regression sweep — full orchestrator router suite green (SC4 / #876)

**Depends on:** Task 3 | **Files:** none (verification)

1. Run: `npx vitest run packages/orchestrator/src/agent/` — assert the entire router/backend-factory suite is green (no #876 regression: design stages still route to `routing.modes.thinking`; per-skill overrides still win; AMR tier selection intact for tier/intelligence useCases).
2. If any pre-existing test flips, revisit Task 3's predicate (it is too broad — it must fire ONLY for skill useCases that would otherwise hit `routing.default`).
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. No commit (verification only; fold any fix into Task 3's scope via amend if the suite is red).

### Group 2 — Staged empty-diff gate (D1–D3 / SC1 / SC2)

#### Task 5: FAILING test — staged unit with empty diff is currently marked done (SC1)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`

1. Read `settleWorkflowSuccess` (`orchestrator.ts:3261-3280`) and the `newOrch` helper (`:121-140`) + `LOCAL_BACKEND`/`OLLAMA_BACKEND` fixtures (`:50-72`) to confirm the reach-in cast pattern.
2. Add a `describe('settleWorkflowSuccess — staged empty-diff halt (D1/SC1)')` block. Add a private-reach helper mirroring `gate()`:
   ```ts
   function settleSuccess(orch: Orchestrator) {
     return (unit: string, runs: unknown[]) =>
       (
         orch as unknown as {
           settleWorkflowSuccess: (u: string, r: unknown[]) => Promise<void>;
         }
       ).settleWorkflowSuccess(unit, runs);
   }
   ```
3. Test body (SC1): construct `newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 5, vi.fn(async () => ({ hasChanges: false })))`. Seed a running entry so `settleWorkflowSuccess` sees a workspacePath: reach in and set `(orch as any).state.running.set('i1', { identifier:'ISS-1', workspacePath: tmpDir })`. Spy `persistLaneSafe` (or `persistLane`) and the terminal/escalation path (`settleWorkflowTerminal` / the `needs-human` push). Provide the last stage run with a `decision.backendName` of `'local'` so locality resolves to local. Call `await settleSuccess(orch)('i1', [ { index:0, step:{ skill:'harness-execution' }, decision:{ backendName:'local' }, outcome:'pass', /* … minimal StageRun */ } ])`.
4. Assert: `persistLaneSafe` was NOT called with `('i1','success')`; instead the empty-diff halt routed to the terminal/escalation path with a reason containing `'no changes produced'`. **This MUST fail** (current `settleWorkflowSuccess` unconditionally persists `'success'`).
5. Run: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts -t 'staged empty-diff halt'` — observe FAIL.
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `test(orchestrator): failing test for staged empty-diff unit marked done (D1/SC1)`

#### Task 6: Wire the empty-diff gate into settleWorkflowSuccess (D1–D3)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In `settleWorkflowSuccess(unit, runs)`, BEFORE `persistLaneSafe(unit, 'success')` (`:3274`):
   - Resolve the unit's workspace: `const entry = this.state.running.get(unit)` (already read `:3262`); `const workspacePath = entry?.workspacePath`.
   - Derive locality from the last stage's routed backend: read `runs[runs.length-1]?.decision?.backendName`, look up `this.config.agent.backends?.[name]`, and gate on `isLocalEndpointBackend(def)` (the SAME predicate `runLocalWorkflowGate` uses `:2616`). If NOT local OR `workspacePath` is undefined → skip the diff check (fail-OPEN, proceed to `persistLane('success')` unchanged — preserves SC6 for non-local + the already-deleted-entry race).
   - If local + workspacePath present: `const diff = await this.diffRunner(workspacePath)`. If `!diff.hasChanges`: do NOT `persistLaneSafe(unit,'success')`; instead `return await this.settleWorkflowTerminal(unit, runs, undefined, new Error('no changes produced — the agent completed without implementing anything'))` (reuse the existing terminal → `needs-human` escalation path, D3). Wrap the `diffRunner` call in try/catch → on error, fail-OPEN (log + proceed to success) mirroring `defaultLocalDiffRunner`'s fail-open contract (`:324`).
2. Non-empty diff (`hasChanges: true`) → fall through to the existing `persistLaneSafe(unit, 'success')` unchanged (SC2).
3. Do NOT edit `runLocalWorkflowGate` (single-dispatch) or its empty-diff block (`:2620-2630`) — this is a separate staged check reusing the same `this.diffRunner` field.
4. Run: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts -t 'staged empty-diff halt'` — SC1 now PASSES.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `fix(orchestrator): halt staged local unit on empty workspace diff instead of marking done (D1-D3/SC1)`

#### Task 7: Regression test — staged unit with non-empty diff completes as today (SC2)

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/orchestrator.local-gate.test.ts`

1. Add to the `staged empty-diff halt` describe: a test constructing `newOrch(..., vi.fn(async () => ({ hasChanges: true })))`, same running-entry seed + local `decision.backendName`. Spy `persistLaneSafe`. Call `settleSuccess(orch)('i1', runs)`.
2. Assert: `persistLaneSafe` WAS called with `('i1','success')` exactly once; the terminal/escalation path was NOT invoked; `diffRunner` was called once.
3. Add a non-local regression case: `newOrch({ primary: CLAUDE_BACKEND }, 'primary', …, vi.fn(hasChanges:false))` with the last stage `decision.backendName:'primary'` → assert `persistLaneSafe('i1','success')` IS called AND `diffRunner` was NOT called (non-local skips the staged gate — SC6).
4. Run: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts` — full file green.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `test(orchestrator): staged non-empty diff completes + non-local skips staged gate (SC2/SC6)`

#### Task 8: Regression sweep — single-dispatch gate byte-identical (SC6 HARD)

**Depends on:** Task 7 | **Files:** none (verification)

1. Run: `npx vitest run packages/orchestrator/src/orchestrator.local-gate.test.ts` and confirm the pre-existing single-dispatch empty-diff tests (`runLocalWorkflowGate — empty-diff halt (Blocker 2b)`, `:342-378`) are green and UNMODIFIED (git diff shows no edits to lines 342-378 or to `runLocalWorkflowGate`).
2. Run `git diff --stat packages/orchestrator/src/orchestrator.ts` and confirm changes are confined to `settleWorkflowSuccess` — NO edits to `runLocalWorkflowGate` or the `workflowGates` read site.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. No commit (verification only).

### Group 3 — Stage-prompt drive (D5 / SC5)

#### Task 9: Thread `produces` into the renderer + STAGE_PROMPT_TEMPLATE variable set (FAILING test first)

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/workflow/local-stage-prompt.test.ts`, `packages/orchestrator/src/workflow/orchestrator-context.ts`

1. In `local-stage-prompt.test.ts`, extend the "references the same variable set" test (and add a new assertion) to require BOTH templates reference `{{ produces }}` and that the variable sets are identical. Also add a render smoke test: render `LOCAL_STAGE_PROMPT_TEMPLATE` via `PromptRenderer` (strictVariables) with a bag that INCLUDES `produces` and assert it does not throw. **This MUST fail** (templates don't reference `produces` yet; and if the renderer bag omits `produces`, strictVariables throws once the template references it).
2. Run: `npx vitest run packages/orchestrator/src/workflow/local-stage-prompt.test.ts` — observe FAIL.
3. In `orchestrator-context.ts` `renderStagePromptFactory` (`:194-217`), add `produces: step.produces ?? ''` to the render bag (confirm the `WorkflowStep`/plan stage type has a `produces` field; if named differently, use the actual declared-output field — verify against the `WorkflowExecutionPlan['stages'][number]` type). Keep `exactOptionalPropertyTypes` happy (default to `''`, never explicit `undefined`).
4. Add `{{ produces }}` to `STAGE_PROMPT_TEMPLATE` in a location that reads naturally (e.g. the stage header line: `Stage {{ stageNumber }}: {{ skill }} → produces {{ produces }}`) so BOTH templates share the variable (strictVariables parity). Keep the default template otherwise byte-identical in structure.
5. Run: `npx vitest run packages/orchestrator/src/workflow/local-stage-prompt.test.ts` — variable-set + render tests PASS.
6. Run: `node packages/cli/dist/bin/harness.js validate` and `node packages/cli/dist/bin/harness.js check-deps` (confirm no NEW cycle — the pre-existing orchestrator-context↔local-stage-prompt cycle must not grow; threading `produces` adds no import).
7. Commit: `feat(orchestrator): thread stage `produces` label into both stage-prompt templates (SC5)`

#### Task 10: Strengthen LOCAL_STAGE_PROMPT_TEMPLATE completion-drive wording (D5)

**Depends on:** Task 9 | **Files:** `packages/orchestrator/src/workflow/local-stage-prompt.ts`, `packages/orchestrator/src/workflow/local-stage-prompt.test.ts`

1. In `local-stage-prompt.test.ts`, add assertions that `LOCAL_STAGE_PROMPT_TEMPLATE` drives production: it references `{{ produces }}`, contains drive language (e.g. `PRODUCE`), and NO LONGER says "then stop" as the terminal instruction after merely reading. Add a guard that the `<<<BEGIN {{ entry.name }}>>>` / `<<<END {{ entry.name }}>>>` fencing lines are byte-identical to the current template (copy the exact substrings into the assertion). Run and observe the new drive assertions FAIL.
2. In `local-stage-prompt.ts`, rewrite the opening line (`:20`) and the skill line (`:29`) to drive completion, e.g.:
   - Header: `... executing stage {{ stageNumber }} ... Do this stage's work to completion and PRODUCE its output ({{ produces }}) — do not stop after merely reading the skill's instructions.`
   - After the `harness skill run` block: `The skill will instruct you to WRITE files ({{ produces }}). Do the work it describes to completion and PRODUCE this stage's output before stopping — reading the instructions is not completing the stage.`
   - Keep the `harness skill run {{ skill }} --autonomous --path .` bash block and the `/harness:X → harness skill run harness-X` redirect intact (SC5 + lint contract).
   - Keep the `<<<BEGIN {{ entry.name }}>>>`/`<<<END {{ entry.name }}>>>` prior-stage fencing BYTE-IDENTICAL (`:41-46`).
3. Run: `npx vitest run packages/orchestrator/src/workflow/local-stage-prompt.test.ts` — all green (including the byte-identical-fencing guard).
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `feat(orchestrator): drive LOCAL stage prompt to produce the stage's declared output (D5/SC5)`

#### Task 11: Verify the .md lint guard + non-local rendering unchanged (SC5 / SC6)

**Depends on:** Task 10 | **Files:** none (verification), possibly `packages/orchestrator/src/local-template-lint.test.ts`

1. Run: `npx vitest run packages/orchestrator/src/local-template-lint.test.ts`. This lints `harness.orchestrator.local.md` (the `.md` indirection doc, NOT the TS template) — it should stay GREEN with no edit because Group 3 changed only the TS `LOCAL_STAGE_PROMPT_TEMPLATE`/`STAGE_PROMPT_TEMPLATE`, not the `.md` doc.
   - If (and only if) it fails because a shared body-line-budget or wording assertion also covers the TS template, make the MINIMAL edit required and note it; do NOT re-inline methodology.
2. Confirm `selectStagePromptTemplate(false) === STAGE_PROMPT_TEMPLATE` still holds and non-local rendering is structurally unchanged (SC6): `npx vitest run packages/orchestrator/src/workflow/local-stage-prompt.test.ts -t 'SC-LOCAL'`.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit ONLY if a lint edit was required: `test(orchestrator): update .md lint guard for stage-prompt drive wording (SC5)`. Otherwise no commit.

### Group 4 — Docs + ADR + changeset + SC6 sweep

#### Task 12: Doc note in the multi-backend routing guide

**Depends on:** Task 11 | **Files:** `docs/guides/multi-backend-routing.md` | **Category:** integration

1. Read `docs/guides/multi-backend-routing.md` to find the section covering staged/per-phase routing.
2. Add a short subsection documenting: (a) execution stages (no `cognitiveMode`) route to `routing.default`, not the design reasoner; (b) a staged local unit that produces an empty workspace diff HALTS (routes to retry → `needs-human`) rather than being marked done — extending the #843 single-dispatch empty-diff guarantee to the staged path.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `docs(routing): note staged empty-diff halt + execution→routing.default`

#### Task 13: ADR for D1 (staged empty-diff halt)

**Depends on:** Task 12 | **Files:** `docs/knowledge/decisions/00NN-staged-empty-diff-halt.md` | **Category:** integration

1. Determine the next ADR number: `ls docs/knowledge/decisions/` — after `0074-*` use `0075` (or the next free integer).
2. Read `docs/knowledge/decisions/0074-finish-staged-engine-for-per-phase-routing.md` for the house ADR format.
3. Write `docs/knowledge/decisions/0075-staged-empty-diff-halt.md`: Context (staged path lacked #843's completes-or-halts guarantee — hollow completions marked done); Decision (D1/D2/D3 — a staged unit must produce a non-empty workspace git diff or halt→retry→`needs-human`, reusing the `diffRunner`/`hasChanges` seam); Consequences (extends the #843 trustworthiness invariant to the staged path; non-local + single-dispatch byte-identical; empty-diff halts, does not improve model quality — the model's design weakness is out of scope).
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `docs(adr): 0075 staged empty-diff halt extends the #843 trustworthiness invariant (D1)`

#### Task 14: Changeset + final full-suite regression (SC6 HARD)

**Depends on:** Task 13 | **Files:** `.changeset/trustworthy-staged-local-dispatch.md` | **Category:** integration

1. Create `.changeset/trustworthy-staged-local-dispatch.md`:

   ```md
   ---
   '@harness-engineering/orchestrator': minor
   ---

   Bring #843's trustworthiness guarantees to the staged local-dispatch path: a staged unit that produces an empty workspace diff now halts (retry → needs-human) instead of being marked done; no-cognitiveMode execution stages route to `routing.default` (not the design reasoner); the LOCAL stage prompt drives the model to produce its declared output. Unstaged workflows and the single-dispatch path are byte-identical.
   ```

   - Do NOT add `@harness-engineering/types` — no `packages/types/src` file changed. (If Task 9 required a `WorkflowStep.produces` type addition in `packages/types/src`, add `'@harness-engineering/types': patch` and note it here — otherwise omit.)

2. Run the FULL orchestrator suite: `npx vitest run packages/orchestrator/src` — assert green. Spot-confirm SC6: single-dispatch empty-diff tests + unstaged workflow tests unchanged and green.
3. Run: `node packages/cli/dist/bin/harness.js validate`
4. Commit: `chore(changeset): trustworthy staged local dispatch (minor)`

---

## Sequencing Notes

- Group 1 → 2 → 3 → 4 is the spec's Implementation Order (routing, gate, prompt, docs). Groups are independent at the file level EXCEPT the shared `orchestrator.local-gate.test.ts` (Tasks 5, 7) and the shared prompt files (Tasks 9, 10) — those tasks are strictly ordered within their group.
- Verification-only tasks (4, 8, 11) gate each group before moving on; fold any red into the preceding fix task rather than proceeding.
- **SC6-critical tasks flagged:** Tasks 6, 8, 9, 11 all touch or verify the graceful-degradation boundary. Task 6 must NOT edit `runLocalWorkflowGate` or the `workflowGates` read site; Task 8 explicitly diffs to prove it did not.

## Flags for the executor

- **Pre-existing `check-deps` cycle:** `orchestrator-context.ts → local-stage-prompt.ts` (self-referential in the report). It is NOT introduced by this work; Tasks 3/9 run `check-deps` to prove no NEW cycle. Do not attempt to fix the pre-existing cycle in this plan (out of scope).
- **Pre-existing `harness validate` findings:** dashboard hardcoded-color warnings are unrelated; treat validate as green if only those + the known cycle appear.
- **Do NOT touch:** the single-dispatch `runLocalWorkflowGate` empty-diff block (`orchestrator.ts:2620-2630`); its tests (`orchestrator.local-gate.test.ts:342-378`); the `workflowGates` read site (`newOrchWithGates`, `:196-209`).
- **Root-cause gate (Task 2):** if the SC3 test does not fail against `AdaptiveRouter.route`, the mis-route is on the identity `resolveStageBackend` path instead — STOP and re-scope Task 3 to `resolveStageBackendFactory`/`buildStageUseCase` before writing any fix.
