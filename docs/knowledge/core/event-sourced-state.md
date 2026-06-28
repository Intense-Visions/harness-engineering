---
type: business_process
domain: core
tags: [event-sourcing, projections, snapshot, lane-machine, guards, migration, provenance]
---

# Event-Sourced State

Harness machine state is an **append-only event log** with **deterministic
projections** and a **materialized snapshot cache**. This replaces the legacy
mutated `.harness/state.json`. The authoritative model and its two governing
decisions live in ADR [0048](../decisions/0048-event-log-authoritative-snapshot-derived.md)
(event log authoritative; snapshot derived) and ADR
[0049](../decisions/0049-guarded-lane-state-machine.md) (guarded lane machine);
the canonical decision text is the spec's Decisions Made table
(`docs/changes/event-sourced-state-model/proposal.md`). This doc describes the
concepts and how they relate — it does not restate the decisions.

## Concepts

### Append-only event log

`state.events.jsonl` (resolved per `getStateDir` scope: global / stream /
session) is the single source of truth. Writers append lock-free with `O_APPEND`,
keeping each JSONL line within one atomic `write()` (oversized payloads spill to a
blob side-file). Total order is the ordering key `(seq, writerId)`, governed by two
invariants: **INV-1** — each process has a globally-unique, stable `writerId`; and
**INV-2** — `seq` is re-derived from the live log tail on every append
(`max(tailSeq, localCounter) + 1`), never from a cached max. `timestamp` is
human-facing only and is never the ordering authority.

### Projection / read-model

`reduce(events) → Snapshot` composes three **pure** projections, each
`(events) → subDocument`: `projectCoreState`, `projectLanes`, and `projectAudit`.
Each is independently testable and lands incrementally. `projectCoreState` is the
**legacy bridge**: it produces the existing `HarnessState` fields, and the thin
`toHarnessState(snapshot.coreState)` adapter returns the legacy shape so readers
migrate by swapping `loadState(...)` for `toHarnessState(readSnapshot(...).coreState)`
with no field-shape change.

### Materialized snapshot

`state.snapshot.json` (`schemaVersion: 2`, `{ coreState, lanes, audit, meta.lastSeq }`)
is a **derived cache**, not an authority. `materialize` is its sole writer (atomic
temp + rename), debounced and lazy. A snapshot that is missing, stale
(`tailSeq > meta.lastSeq`), or unparseable is a **cache miss**: readers fall back to
`reduce(loadEvents())` and schedule a background refresh — the read path itself never
writes, so concurrent reads do not stampede the file.

### Lane state machine

`lane-machine.ts` holds the transition table for task lanes:
`planned → claimed → in_progress → in_review → done`, plus `blocked`/`canceled`,
`in_review → in_progress` rework, and blocked/cancel escapes from any non-terminal
lane. `done` and `canceled` are terminal. Core owns the table; orchestrator and
autopilot consume it through `transitionLane` and the `manage_state task-transition`
action.

### Transition guards

Three pure guards gate every transition, each returning a `Result` so illegal moves
are `Err`, never silent: **dependency** (`in_progress` requires every `dependsOn`
task `done`), **evidence** (`done` requires non-empty evidence), and **forced** (any
off-table move requires `force: true` with `actor` + `reason`, recorded on the
`lane_transitioned` event).

### Genesis migration

Legacy `.harness/state.json` is imported via a single honest `state_imported`
genesis event — no fabricated provenance. Import is idempotent on **"a
`state_imported` event is already present in the log"** (not merely "the file
exists"), so an empty log left by a crashed import still imports, and a re-run is a
no-op. The born-deduplicated `events.jsonl` is **retired** (discarded, not imported —
it was observability-only and lossy by design).

## Relationships

- **snapshot —derived-from→ event log.** The snapshot is a cache of
  `reduce(loadEvents(scope))`; the log is authoritative and the snapshot can always
  be recomputed from it (cache miss on staleness/corruption). See ADR
  [0048](../decisions/0048-event-log-authoritative-snapshot-derived.md).
- **lanes-projection —uses→ transition guards.** `projectLanes` and `transitionLane`
  apply the dependency / evidence / force guards before any `lane_transitioned`
  event is accepted. See ADR
  [0049](../decisions/0049-guarded-lane-state-machine.md).
- **audit-projection —subsumes→ GH-580.** `projectAudit` folds verbatim
  `user_input_captured` and `approval_requested` / `approval_resolved` events into
  the same authoritative log, subsuming the Append-Only Session Audit Trail (#580)
  and deriving the observability timeline that `events.jsonl` used to provide. See
  the spec's §Success Criteria 5.

## See also

- [`state-management.md`](state-management.md) — streams, sessions, handoff, and the
  `toHarnessState` legacy bridge.
- ADR [0048](../decisions/0048-event-log-authoritative-snapshot-derived.md),
  ADR [0049](../decisions/0049-guarded-lane-state-machine.md).
- Spec: `docs/changes/event-sourced-state-model/proposal.md`.
