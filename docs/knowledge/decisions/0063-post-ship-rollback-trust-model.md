---
number: 0063
title: Post-ship rollback trust model
date: 2026-07-09
status: accepted
tier: large
source: docs/changes/harness-rollback/proposal.md
---

## Context

The harness enforces quality up to the moment code merges — brainstorming, planning, execution, verification, review, and (soon) a post-merge outcome-eval gate. But the lifecycle stops enforcing the instant code ships: the SDLC coverage analysis (`docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`) marks **Operations a `gap`**. The article framing is a circuit breaker — "a mechanism that physically stops the fall before it hits the ground." Before `harness:rollback`, the only post-ship recourse was a human noticing a regression and hand-authoring a revert.

Automating rollback raises a trust question that is not the same as the rest of the pipeline: every prior gate _blocks_ work (a conservative, fail-safe direction), whereas rollback _writes_ — it opens, and potentially merges, a PR that changes shipped code. A wrong revert is itself an incident. The decision is how much autonomy the harness should have over that post-merge write, and how it earns more.

## Decision

Rollback autonomy is a **staged trust progression**, and v1 occupies only the first stage.

- **Stage 1 — Propose-only (this release).** On a trigger (a signal-threshold crossing today; a post-merge outcome-eval `NOT_SATISFIED` once #31 wires it), the engine classifies revert-readiness and, if ready, **opens a revert PR with full context. A human merges it.** The `rollback-propose` workflow carries `pull-requests: write` but deliberately **not** `contents: write`, and uses **no self-approving PAT** — it is mechanically incapable of merging its own revert. This mirrors how `required-review` shipped non-blocking first.
- **Stage 2 — Auto-merge (deferred).** Auto-merging a revert above a confidence bar is a separate, later decision. It is gated on _evidence_: every Stage-1 proposal appends an append-only `rollback_event` breadcrumb recording the trigger, the revert-ready verdict, and the eventual outcome (did the human merge the proposed revert?). Only once that record demonstrates the classifier proposes _correct_ reverts at a high rate should auto-merge authority — and the `contents: write` + scoped self-approval it requires — be granted.

Revert-readiness is a hard gate on _proposing_: a target is ready only when an in-memory `git merge-tree` revert applies cleanly **and** no later merge depends on the target's files. Blast-radius and migration risk are surfaced as PR-body context, never as gates — they inform the human, who is the Stage-1 backstop.

## Consequences

**Positive:**

- The harness finally enforces past ship: a regression produces a prepared, reviewed-by-a-human revert instead of nothing.
- The high-blast-radius action (merging a revert) stays with a human until the system has _earned_ the authority with data, not assumptions. The breadcrumb makes that a measurable bar rather than a judgment call.
- The engine is trigger-agnostic and merge-shape-aware (two-parent and squash/rebase), so Stage 2 is a permissions + config change, not a rewrite.

**Negative:**

- Stage 1 is not a true "physically stops the fall" breaker — it still needs a human to click merge, so mean-time-to-revert is bounded by human latency.
- The `rollback_event` breadcrumb is only as useful as its outcome reconciliation; if the "did the revert merge?" signal is not captured reliably, the Stage-2 bar cannot be evaluated.
- Signal-threshold triggering is coarse (daily-granularity `.harness/signals/` points swept hourly); it will lag fast-moving production incidents until a live signal source exists.

## Alternatives considered

- **Auto-merge from day one (Stage 2 immediately).** Rejected: auto-merging code with no track record of proposal correctness inverts the harness's own "earn enforcement with evidence" discipline and makes a wrong revert an unreviewed incident.
- **Human-only reverts (no automation).** Rejected: leaves the Operations gap open; the whole point is to close the post-ship enforcement edge.
- **Gate on a full risk model (blast-radius + migration reversibility) before proposing.** Rejected for v1: migration-reversibility detection is genuinely hard, and since a human merges every Stage-1 revert, surfacing risk as context is sufficient; a hard risk gate is premature until auto-merge exists.
