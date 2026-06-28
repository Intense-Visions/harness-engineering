---
number: 0049
title: Guarded Lane State Machine
date: 2026-06-27
status: accepted
tier: large
source: docs/changes/event-sourced-state-model/proposal.md
---

## Context

The orchestrator's task lifecycle was a separate concern from core state. It
already had a pure reducer (`packages/orchestrator/src/core/state-machine.ts`
`applyEvent`) but it was **ephemeral in-process** and its transitions were
**unguarded**: no dependency checks, no evidence required to reach terminal
states, no forced-transition discipline. A task could jump to `done` with nothing
to show for it, or enter work before its dependencies were satisfied, and none of
it was durably recorded (spec §Overview, §Technical Design → Lane state machine).

The event-sourced log (ADR [0048](0048-event-log-authoritative-snapshot-derived.md))
gives us a durable place to record lane transitions; this decision defines the
machine that governs them.

## Decision

Records **D4** from the spec's Decisions Made table (canonical text lives there;
this ADR is a pointer).

A harness-native lane state machine, owned by **core**
(`state/event-sourcing/lane-machine.ts`), with the transition table:

> `planned → claimed → in_progress → in_review → done`, plus `blocked` and
> `canceled`; `in_review → in_progress` (rework); `<any non-terminal> → blocked`;
> `blocked → <prior lane>`; `<any non-terminal> → canceled`. Terminal lanes:
> `done`, `canceled`.

Three pure guards, each returning a `Result` so illegal moves are `Err`, never
silent:

- **`dependencyGuard`** — a task may not enter `in_progress` until every
  `dependsOn` task is `done`.
- **`evidenceGuard`** — entering `done` requires non-empty `evidence`
  (PR/commit/test refs).
- **`forceGuard`** — any transition off the allowed table requires `force: true`
  with both `actor` and `reason`, recorded on the `lane_transitioned` event.

This is a **new cross-package contract**: core owns the machine; orchestrator and
autopilot **consume** it via `transitionLane` and the `manage_state`
`task-transition` MCP action, rather than each re-implementing lane logic.

## Consequences

- Illegal transitions are `Err` and never silently applied; callers must handle
  the failure.
- Reaching `done` is impossible without evidence; reaching `in_progress` is
  impossible with unmet dependencies — the guards are mechanical, not advisory.
- Off-table escapes are still possible but never invisible: `force` demands an
  `actor` and a `reason`, both persisted on the `lane_transitioned` event for the
  audit trail.
- `done`/`canceled` are terminal — no transitions leave them.
- The orchestrator's former ephemeral `applyEvent` lane logic is superseded by
  persisting lane events through the core log; one machine, one source of truth.
- YAGNI: no `for_review`/`approved` review sub-states beyond the single
  `in_review` lane.

See also: the concept doc [`event-sourced-state.md`](../core/event-sourced-state.md)
and the companion ADR [0048](0048-event-log-authoritative-snapshot-derived.md).
