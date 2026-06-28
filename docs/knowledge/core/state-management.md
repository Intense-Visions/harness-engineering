---
type: business_process
domain: core
tags: [state, streams, sessions, persistence, isolation]
---

# State Management

The state module is the operational memory of Harness, persisting project health, decisions, learnings, and session state across skill executions.

## Stream-Based Isolation

Each git branch gets its own state stream at `.harness/streams/{stream-name}/`, preventing state collision when developers work on parallel branches. Streams are auto-created on first use and track creation and last-active timestamps for cleanup.

## Session Layering

Within each stream, sessions add an additional isolation layer at `.harness/sessions/{session-id}/`. Sessions accumulate section-based state (terminology, decisions, constraints, risks, open questions, evidence) across skill executions. This enables cold-start context restoration and cross-skill state sharing.

## Event-Sourced Core State

Core state is **event-sourced**: an append-only log (`state.events.jsonl`) is the
single source of truth, and the `coreState` document — current position, decisions,
blockers, and per-task progress (pending/in_progress/complete) — is a **projection**
(`projectCoreState`) over that log. Mutations append per-field events rather than
rewriting a whole-state file, so concurrent writers never clobber each other's
unrelated fields. The `toHarnessState` adapter bridges the projection back to the
legacy `HarnessState` shape, so existing readers migrate by swapping
`loadState(...)` for `toHarnessState(readSnapshot(...).coreState)` with no
field-shape change.

See [`event-sourced-state.md`](event-sourced-state.md) and ADRs
[0048](../decisions/0048-event-log-authoritative-snapshot-derived.md) /
[0049](../decisions/0049-guarded-lane-state-machine.md) for the authoritative
description of the log, projections, materialized snapshot, and the guarded lane
state machine.

## Self-Healing Reads

All state reads self-heal: if files are missing or corrupted, the system returns
sensible defaults (empty collections) rather than failing. The materialized
snapshot (`state.snapshot.json`, `schemaVersion: 2`) is a derived cache — a
missing, stale, or unparseable snapshot is a cache miss, and readers transparently
fall back to `reduce(loadEvents())` rather than failing.

## Handoff Protocol

When transitioning between skills, a Handoff captures: completed tasks, pending work, blockers, and recommended next skills. This reduces context loss during skill transitions and enables smooth hand-off.
