---
number: 0070
title: Harness-enforced local workflow gates (orchestrator gates the local branch at completion)
date: 2026-07-15
status: accepted
tier: integration
source: docs/changes/local-backend-full-workflow/proposal.md
---

## Context

The local (`pi`) backend runs a small, non-agentic model that cannot be trusted
to self-discipline: its prompt template (`harness.orchestrator.local.md`) tells
it to run the mechanical gate (typecheck + lint + test) and an outcome check
before shipping, but nothing stopped a local agent from skipping the gate and
opening a PR on a non-compiling build. The demonstrated failure mode — a local
dispatch that ships a red build because the model ignored its own instructions —
motivated D2 of the spec: **the orchestrator, not the agent's discipline, must
enforce the gates on the local path.**

Two facts about the shipped code shaped the decision:

1. The completion path already runs both quality engines (the single-agent
   security verdict + the `OutcomeEvaluator` acceptance-eval via
   `deriveAcceptanceEvalVerdict`), but **detect-only and AMR-gated** — a
   `quality-fail` on a NORMAL exit only climbs the AMR escalation counter; it
   never blocks or re-dispatches. A plain local dispatch with no AMR policy runs
   neither engine.
2. The local agent **ships itself** (`git push` + `gh pr create`) as its terminal
   step, so by the time any completion-time verdict runs, the PR already exists.

## Decision

**Option C — completion-gate re-dispatch.** On the LOCAL path only, the
orchestrator runs an enforced gate (`runLocalWorkflowGate`) BEFORE a normal exit
is treated as terminal:

- `runLocalWorkflowGate(issue, workspacePath, backendName)` runs for `pi`/`local`
  backends only (non-local → unconditional `{ ok: true }`, so the Claude/AMR path
  is byte-identical). It runs the injected/real **verify** (typecheck + lint +
  test) over the workspace and, when the issue has a spec, the shared
  **`OutcomeEvaluator`** core (lifted out of `deriveAcceptanceEvalVerdict` into
  `evaluateOutcomeCore`, un-gated from the AMR-active + `acceptanceEval.enabled`
  requirements — D2). A red verify or a high-confidence `NOT_SATISFIED` verdict
  returns a blocking `{ ok: false, reason }`.
- `finalizeNormalCompletion` (the extracted normal-exit seam) routes a blocking
  gate through the SHIPPED `emitWorkerExit('error', …)` retry branch
  (`state-machine.ts` worker-exit `else` branch) instead of the normal exit. That
  branch computes `nextAttempt`, checks the retry budget, and either enqueues a
  retry (re-dispatch) or escalates. **The re-dispatch IS the re-prompt**: the next
  render threads the prior gate-failure reason into the prompt as a post-render
  preamble (the renderer is LiquidJS with `strictVariables: true`, so the preamble
  is appended after render rather than injected as a template variable).
- Retry-budget exhaustion queues exactly one `needs-human` escalation via the
  existing `checkRetryBudget` path — no bespoke escalation logic.

The gate is fully guarded: any thrown error → a conservative block
(`{ ok: false, reason: 'gate error: …' }`), mirroring the shipped fail-safe
pattern, so a gate that cannot run re-dispatches rather than silently passing.

One template correction folds in regardless: the local template's gate command
names were wrong (`harness verify` verifies branch-naming only; `harness
outcome-eval` is not a CLI command). They now name the real gates — `harness
validate` + the project's own typecheck/lint/test — matching what the
orchestrator enforces.

## Rejected alternatives

- **Option A — detect-and-escalate after the agent ships.** Rejected: it cannot
  meet the spec's SC3 ("does NOT allow ship"). The PR is already open by
  completion time, and it provides no re-prompt — only an escalation counter that
  affects future dispatches.
- **Option B — orchestrator controls ship.** Rejected as over-invasive: it forks
  PR creation out of the agent and into the orchestrator for one backend, touching
  the highest-blast-radius code (the shared ship path) to buy a property Option C
  gets by reusing the existing retry branch.

## Consequences

- Reuses the shipped retry budget + `needs-human` escalation verbatim — no new
  escalation machinery.
- Local-only guard means the Claude/AMR completion path is unchanged; the local
  gate **composes** with the AMR sibling verdicts (both still run on a green local
  gate), it does not replace them.
- Runs verify (typecheck + lint + test) inside the completion path for local
  dispatches, accepting the latency (D1: halting over shipping cleanup tax). An
  async/streamed gate is a Phase 3 concern.
- The concrete verify detector (`defaultLocalVerifyRunner`) is injected via a
  `verifyRunner` seam, so the detection strategy can evolve without touching the
  completion wiring; provider routing for the local outcome-eval defaults to
  `resolveComplexityProvider()` (local SEL), with a `workflowGates` routing flag
  deferred to Phase 3.

See `Orchestrator.runLocalWorkflowGate`, `Orchestrator.finalizeNormalCompletion`,
`Orchestrator.evaluateOutcomeCore`, and `defaultLocalVerifyRunner` in
`packages/orchestrator/src/orchestrator.ts`; tests in
`packages/orchestrator/src/orchestrator.local-gate.test.ts`.
