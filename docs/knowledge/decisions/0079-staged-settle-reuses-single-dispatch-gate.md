# 0079 — Staged local settle reuses the single-dispatch acceptance gate

- **Status:** Accepted
- **Date:** 2026-07-18
- **Context tags:** orchestrator, staged-workflow, settle, verification-gate, acceptance, convergence, local-model

## Context

The staged workflow engine (`workflows:`) dispatches a matched item as one multi-stage run on a single worktree. Its completion path — `settleWorkflowSuccess` — marked a unit "completed all stages" after every stage merely _ran_: the per-stage gate always passes (no `pass-required`), and `ret.success` is the model's `TASK_COMPLETE`, not "tests passed". The only settle-time check was the #886 empty-diff halt, which passes any non-empty diff. So real-but-incomplete work (a rule written, its test + integration count-bump missing) trivially cleared the empty-diff check and shipped as **hollow success**, then `cleanWorkspaceWithGuard` wiped the (local, no-branch-pushed) workspace — destroying the partial progress before any retry could accumulate on it.

Meanwhile the **single-dispatch** local path (#843/#874) already converges: `runLocalWorkflowGate` runs a real acceptance gate (empty-diff → `verifyRunner` typecheck+lint+**test** → outcome-eval); on FAIL it re-dispatches with the failure fed back and the workspace preserved (#890); on PASS the work has shipped. The staged path had reimplemented dispatch and lost this contract, leaving two convergence stories: a real one (single-dispatch) and a hollow one (staged).

## Decision

For a **local** last-stage staged unit, `settleWorkflowSuccess` routes through the **same** `runLocalWorkflowGate` the single-dispatch path uses — empty-diff → the mechanical step → outcome-eval — instead of the empty-diff-only sub-check. There is ONE convergence contract, not two.

- **The #886 empty-diff halt is subsumed** as step 0 of that gate — it still fires (a local staged unit that wrote nothing still halts), it is just no longer a separate code path.
- **The mechanical step is configurable (D2).** The matched `StagedWorkflowDecl` may declare an optional `acceptance` shell command; when present the gate runs THAT in the workspace and gates on its exit code, in place of `verifyRunner`; when absent, `verifyRunner` (the project's typecheck+lint+test — the default repo gate) is unchanged. Nothing project-specific is baked into the orchestrator — the command is operator config, mirroring the AMR config-surface lesson (the field is wired in BOTH the TS type and the strict Zod schema, or a config that sets it is silently rejected).
- **Locality-scoped (D6).** Enforcement is gated on the SAME `isLocalEndpointBackend` predicate the #886 gate uses, applied to the last stage's routed backend. Non-local/primary staged units and the single-dispatch path are **byte-identical** — the gate is a no-op off the local path.
- **The workspace + issue come from the dispatch closure** (threaded through the settle callback), not solely the running entry — so the gate re-fires on EVERY attempt, including a staged retry re-dispatch where the tick does not recreate the running entry. It fails OPEN only when the workspace is genuinely unknown (no closure value AND no entry — the already-deleted-entry race); a gate that runs and returns `{ ok: false }` never proceeds to success.

## Alternatives considered

- **Keep a diff-only staged heuristic (the status quo).** Rejected: an empty-diff check cannot distinguish incomplete-but-nonempty work from complete work, so it ships hollow success and the wipe destroys the partial progress before a retry can build on it — the observed infinite hollow-success/wipe loop.
- **A second staged-specific gate implementation.** Rejected: two convergence engines drift. `verifyRunner` (or the declared acceptance command) is the authoritative real-test signal; reusing `runLocalWorkflowGate` keeps the staged and single-dispatch contracts identical by construction.

## Consequences

- A local staged unit now converges the same way single-dispatch does: fail → preserve + retry with the reason fed back (#890 accumulates work across attempts); pass → ship. See [ADR 0080](0080-orchestrator-drives-local-staged-terminal.md) for the lane lifecycle and the ship/terminal ends of that loop.
- Adopter projects get a portable acceptance gate: set `acceptance:` on the staged decl to run their own command; omit it to use the repo's default typecheck+lint+test.
- Non-local staged, primary, and single-dispatch paths are unchanged; existing orchestrator tests stay green.
