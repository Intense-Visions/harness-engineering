---
number: 0069
title: AMR single-agent quality-gate fan-in is deferred (mechanism + seam complete, no sound verdict source)
date: 2026-07-12
status: accepted
tier: medium
source: docs/changes/adaptive-model-routing/proposal.md
---

> **Update (2026-07-13): implemented.** The deferral held until a sound source
> existed — and the **baseline-relative diff review** option below was then built.
> On a normal single-agent exit, the orchestrator now scans only the ADDED lines
> of the agent's diff (working-tree vs `merge-base(HEAD, baseRef)`, seeded overlay
> excluded) and feeds `quality-fail` on a NEW error-severity security finding.
> It is sound because every security rule is single-line, so per-added-line
> matching yields exactly the introduced findings — pre-existing patterns never
> count. Success stays `neutral` (never a premature `quality-pass`), the feeder is
> a no-op when AMR is off, and it is fully guarded. See `packages/orchestrator/src/agent/quality-verdict.ts`,
> `WorkspaceManager.getIntroducedDiff`, and `Orchestrator.deriveSingleAgentQualityVerdict`.
> The decision below stands as the record of _why_ it was deferred and _which_
> option was chosen.
>
> **Update (2026-07-13): the LLM acceptance-eval (option 4) is now also built —
> opt-in.** The second sound source named below has landed behind
> `routing.policy.acceptanceEval.enabled` (off by default). On a normal
> single-agent exit, _after_ the always-on security scan comes back clean, the
> orchestrator runs the shared `OutcomeEvaluator` (reusing the SEL-layer analysis
> provider the live classifier already builds — the "orchestrator does not run a
> model inline" constraint no longer holds) over the introduced diff vs the spec's
> success-criteria section, and feeds `quality-fail` only on a **high-confidence
> `NOT_SATISFIED`** (`authority === 'blocking'`, TS-derived). It is gated separately
> from the cheap security scan because a model call is heavy; it is conservative
> (never a premature `quality-pass`) and fully guarded (no spec / no provider /
> empty diff / any error → neutral). See `Orchestrator.deriveAcceptanceEvalVerdict`,
> `outcomeVerdictToQualityFail`, and `WorkspaceManager.getIntroducedDiffText`.

## Context

AMR's vertical escalation (D10/SC16) climbs a coherence unit's required tier when
its output repeatedly fails a **quality** gate: `AdaptiveRouter.recordOutcome(unit,
tier, ok)` feeds `EscalationState`, which raises the floor on the Nth consecutive
failure (monotonic, `strong`-capped), and `onExhausted` hard-fails to a human.
That machinery is **complete and unit-tested**.

There are two dispatch paths, and they are in different states:

- **Staged workflows — LIVE.** The workflow engine already feeds a real quality
  verdict: a `pass-required` stage's gate outcome maps to `ok` and is passed to
  `recordOutcome` per attempt (`execute-workflow.ts` — `ok = step.gate !==
'pass-required' || run.outcome === 'pass'`). A declared multi-stage workflow
  therefore has working vertical escalation today.

- **Single-agent dispatch — SEAM READY, UNFED.** `emitWorkerExit(issueId, reason,
attempt, error?, outcomeClass?)` already routes an `outcomeClass` of
  `'quality-pass' | 'quality-fail' | 'transport' | 'neutral'` into
  `recordAmrOutcome` → `recordOutcome`. But **nothing passes a real quality
  verdict**: a normal runner exit defaults to `'neutral'` (records nothing) — by
  design, because a bare "the runner finished without throwing" is _not_ a quality
  verdict, and recording a premature `'quality-pass'` would clear the unit's
  in-progress failure count and mask accumulating failures.

The open question this ADR settles: **what is a _sound_ quality-verdict source for
single-agent dispatch, and should we wire one now?**

## Options considered

A feasibility investigation traced every candidate source:

1. **Runner-exit signal** (`ExecutionOutcome.result`, derived from
   `reason === 'normal'`). Rejected — it reflects _did the process finish_, not
   _is the work correct_. Feeding it is explicitly unsound (self-clearing failure
   counts).

2. **PR review decision / CI conclusion.** `PRDetector` exposes existence only
   (`{ found }`); there is no review-decision or check-conclusion query, and the
   verdict arrives minutes-to-hours after the agent exits. Consuming it needs an
   async PR/CI ingestion subsystem that does not exist.

3. **In-orchestrator mechanical checks** (`core/review` `runMechanicalChecks` —
   synchronous, model-free, orchestrator→core is an allowed dependency). This is
   the closest option, but it is **only approximately sound**:
   - `validate` / `check-docs` / `check-deps` scan the **whole repo**, so a
     pre-existing AGENTS.md / docs / layer issue would flag `quality-fail` on
     _every_ dispatch, unrelated to the agent's work.
   - `security-scan` runs over the changed files' **full current content** and is
     **not baseline-relative**, so a pre-existing pattern in a touched file (e.g.
     an `eval` in unchanged code) flags as if the agent introduced it.
     Either way, false positives would produce **spurious tier climbs** — routing to
     a more expensive tier for defects the agent did not create. It also needs
     plumbing the orchestrator lacks (a workspace changed-files diff surface; the
     architecture `layers` config to enable the one high-value check).

4. **In-orchestrator LLM acceptance-eval** (`outcome_eval` / `acceptance_eval`).
   A genuine spec-satisfaction verdict — but it requires a model and async
   judgment the orchestrator does not run inline.

## Decision

**Do not wire a single-agent quality feeder now.** The mechanism, the
workflow-path feeder, and the single-agent `outcomeClass` seam are complete;
shipping an _approximate_ feeder (option 3) would inject a behavior-affecting
heuristic with known false-positive modes into the dispatch path, causing
spurious escalations — a net negative over the current escalation-neutral default.
Per the project's diligence rule, an unsound signal is worse than no signal.

The single-agent feeder is **deferred until a sound verdict source exists**. The
sound design, for whoever builds it, is one of:

- **Baseline-relative diff review** — scan only the findings the agent's diff
  _introduced_ (before/after delta on the changed files), not absolute findings.
  This makes option 3 sound; it needs a diff-scoped, baseline-aware review pass.
- **Async PR-review / CI-conclusion ingestion** — a subsystem that correlates a
  merged/blocked PR or a CI conclusion back to the coherence unit and feeds the
  verdict when it arrives (option 2 made real).
- **Inline LLM acceptance-eval** — an in-orchestrator `outcome_eval` runner
  (option 4).

Whichever is built plugs into the **existing** seam with no mechanism change:
compute the verdict, then pass `outcomeClass: verdict ? 'quality-pass' :
'quality-fail'` to `emitWorkerExit`. The wiring is already end-to-end.

## Consequences

- **SC16 is mechanism-satisfied, workflow-live, and single-agent-seam-ready — not
  single-agent-live.** This ADR records that boundary honestly so downstream
  readers do not over-read escalation as universally active.
- **No unsound wiring ships.** The dispatch path stays byte-identical when AMR is
  off, and escalation-neutral for single-agent normal exits when AMR is on.
- **The next step is well-defined and cheap to land** once a sound source exists:
  a single `outcomeClass` argument at the `emitWorkerExit` call site.
- Staged workflows are unaffected — they already escalate on real gate outcomes.

## Links

- Spec: `docs/changes/adaptive-model-routing/proposal.md` ("Deferred follow-ups",
  Phase 4c).
- Seam: `packages/orchestrator/src/orchestrator.ts` (`emitWorkerExit` /
  `recordAmrOutcome`).
- Live workflow feeder (the sound precedent to mirror):
  `packages/orchestrator/src/workflow/execute-workflow.ts` (`recordOutcome` from
  the `pass-required` gate outcome).
