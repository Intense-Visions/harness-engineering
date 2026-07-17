# Trustworthy Staged Local Dispatch

**Keywords:** staged-workflow, empty-diff-gate, hollow-completion, per-stage-routing, completion-drive, local-dispatch, trustworthiness

## Overview and Goals

**Problem.** Running the real orchestrator pilot end-to-end on a staged local workflow revealed that a per-phase run can complete **hollow**: the local reasoner correctly ran the `harness skill run <skill> --autonomous` indirection but produced **zero artifacts** (no `proposal.md`, no code, empty diff), yet the engine marked all 4 stages "completed" and the unit "success → done" (then re-dispatched in a loop). The single-dispatch path was hardened against exactly this by #843 ("completes-or-halts, never silently ships nothing"), but the **staged path never got those guarantees**.

Three distinct gaps:

1. **No completion gate.** `settleWorkflowSuccess` (`packages/orchestrator/src/orchestrator.ts` ~3255) marks the unit done with no diff/artifact check, and the per-stage gate (`execute-workflow.ts:314-319`) marks a stage `pass` unless it has an explicit `gate: 'pass-required'` — the decl's stages carry none, so they **always pass regardless of output**.
2. **Per-stage routing bug.** A no-`cognitiveMode` execution stage resolved to the `reasoner` (design) backend instead of `routing.default` — defeating the per-phase split (execution on the slow design reasoner).
3. **Weak completion drive.** `LOCAL_STAGE_PROMPT_TEMPLATE` (`local-stage-prompt.ts`) says _"Complete THIS stage's task, then stop"_ / _"run the skill … follow its output verbatim"_ — it tells the model to run `harness skill run` and stop, not to **drive the skill to producing its declared `produces` artifact**.

**Goals.**

1. Bring #843's **empty-diff halt** to the staged path — a unit must produce a non-empty workspace diff or **halt/retry/escalate**, never a silent "done."
2. Fix the routing so execution stages route to `routing.default`, not the design reasoner.
3. Strengthen the stage prompt so the model drives the skill to actually produce its `produces` artifact before stopping.

**Out of scope.** The local model's underlying design-skill weakness (brainstorming quality) — the gate turns a hollow run into a _visible halt_, it does not make the model a better designer. Cross-machine handoff. The template generic-vs-repo-specific cleanup (separate follow-up).

**On-strategy.** STRATEGY.md: "the substrate the agent runs on … determines reliability … constraints fire in real time so agents self-correct." An empty-diff halt is that constraint for the staged path.

## Decisions made

- **D1 — Unit-level empty-diff gate (mirror #843).** Before `settleWorkflowSuccess` marks a staged unit done, require a **non-empty workspace git diff**; an empty diff halts. Mirrors the proven single-dispatch `runLocalWorkflowGate` empty-diff halt (`orchestrator.local-gate.test.ts:342-360`). _Why:_ simplest, proven, path-agnostic; catches every hollow case regardless of which stage under-produced.
- **D2 — "Produced" = non-empty git diff.** Reuse the same `hasChanges` notion #843 uses, not per-file artifact existence. _Why:_ robust; declared-artifact paths vary and are brittle to assert.
- **D3 — Hollow → reuse retry/escalation.** An empty-diff unit fails → the existing unit/stage retry budget → **escalate to `needs-human`** on exhaustion. Never mark done. _Why:_ reuse proven machinery; consistent with #843 + the escalation path.
- **D4 — Fix execution routing to `routing.default`.** A no-`cognitiveMode` stage must resolve to `routing.default`, not the reasoner. Root-caused via a TDD failing test reproducing `{skillName:'harness-execution'} → reasoner`. _Why:_ the per-phase split is defeated if execution runs on the design reasoner.
- **D5 — Strengthen the stage-prompt completion drive.** Replace "run the skill, then stop" with language that drives the model to **produce this stage's declared output** before stopping, threading the `produces` label into the template. Keep the byte-identical prior-stage `<<<BEGIN>>>/<<<END>>>` fencing + `strictVariables` contract. _Why:_ the deeper cause — the model reads the skill and stops without doing the work.
- **D6 — Hard graceful degradation.** Unstaged workflows and the single-dispatch path are byte-identical to today; the gate fires only on the staged completion path; the prompt change is local-stage-only.

## Technical design

**D1–D3 — the staged empty-diff gate.** In the staged completion path (`settleWorkflowSuccess`, and/or the engine's terminal `emitWorkflowSuccess` in `execute-workflow.ts`), before marking the unit `success → done`, compute the workspace diff (reuse the same diff-runner the single-dispatch gate uses — `runLocalWorkflowGate`'s `hasChanges`/`diffRunner` seam). If empty: do **not** `persistLane('success')`; instead route to the existing failure/retry path (fail the unit, decrement retry budget, escalate to `needs-human` on exhaustion), emitting a "no changes produced" reason mirroring #843. Non-empty diff → proceed exactly as today.

**D4 — routing fix.** Reproduce with a failing unit test: a staged execution stage (`WorkflowStep` with no `cognitiveMode`) through `route()`/the stage-backend selection resolves to `reasoner` given a config with `routing.default` ≠ reasoner. Root-cause in `BackendRouter.resolve` step 4 / the `workflow-stage` useCase resolution (`execute-workflow.ts` stage dispatch emits a second `workflow-stage` routing decision — verify which decision drives the actual backend). Fix so a no-mode stage lands on `routing.default`.

**D5 — stage prompt.** In `LOCAL_STAGE_PROMPT_TEMPLATE`: change the "then stop"/"follow verbatim" wording to drive completion — e.g. _"The skill will instruct you to WRITE files (a spec, a plan, code). Do the work it describes to completion and PRODUCE this stage's output — do not stop after merely reading the instructions."_ Thread the stage's `produces` label into the render context (extend `renderStagePromptFactory` + the `STAGE_PROMPT_TEMPLATE`/`LOCAL_STAGE_PROMPT_TEMPLATE` variable set, keeping both templates' shared-variable parity so `strictVariables` holds). Keep the `<<<BEGIN>>>/<<<END>>>` fencing byte-identical.

## Integration Points

- **Entry Points.** No new CLI/MCP. Touches the staged completion path (`orchestrator.ts` `settleWorkflowSuccess` / `execute-workflow.ts` terminal), `BackendRouter`/stage routing, and the stage prompt renderer.
- **Registrations Required.** None (internal wiring).
- **Documentation Updates.** A note in `docs/guides/multi-backend-routing.md` on the staged empty-diff halt + that execution stages route to `routing.default`.
- **Architectural Decisions.** **D1** (staged empty-diff halt) is ADR-worthy — it extends the #843 trustworthiness invariant to the staged path.
- **Knowledge Impact.** Concept: "staged-dispatch trustworthiness / empty-diff halt"; relationship: staged-unit-completion → requires-non-empty-diff.

## Success Criteria

- **SC1** A staged unit whose stages produce an **empty workspace diff** does NOT get marked `success → done`; it halts and routes to retry/escalation with a "no changes produced" reason. (unit test on the staged completion path)
- **SC2** A staged unit with a **non-empty diff** completes exactly as today. (regression)
- **SC3** A no-`cognitiveMode` execution stage routes to `routing.default` (not the design `reasoner`) — failing-test-first. (unit test)
- **SC4** Design stages (`cognitiveMode: thinking`) still route to `routing.modes.thinking` — no regression of #876. (unit test)
- **SC5** `LOCAL_STAGE_PROMPT_TEMPLATE` renders under `strictVariables` with the new `produces` variable, keeps byte-identical prior-stage fencing, and the pinned `local-stage-prompt.test.ts` + `local-template-lint.test.ts` stay green (updated only where the drive wording changed). (existing + updated tests)
- **SC6 (HARD)** Unstaged workflows + the single-dispatch path are byte-identical to today — existing single-dispatch + workflow tests stay green. (regression)

## Implementation Order

1. **Routing fix (D4)** — failing test reproducing execution→reasoner; root-cause; fix to `routing.default`; SC3/SC4.
2. **Staged empty-diff gate (D1–D3)** — failing test (empty-diff staged unit marked done); wire the diff check into the staged completion path reusing the #843 diff seam; route empty → retry/escalate; SC1/SC2.
3. **Stage-prompt drive (D5)** — thread `produces` into the renderer; strengthen the drive wording; update the pinned template tests for the new wording only; SC5.
4. **Docs + ADR + graceful-degradation regression tests (SC6).**
