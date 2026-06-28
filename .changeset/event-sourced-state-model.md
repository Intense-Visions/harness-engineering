---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/orchestrator': minor
---

Event-sourced state model with a deterministic reducer (#598).

Replaces the mutated `.harness/state.json` with an append-only event log
(`state.events.jsonl`) + a deterministic reducer composed of pure projections
(`coreState` / `lanes` / `audit`) + a materialized snapshot (`state.snapshot.json`).
Concurrent writers append lock-free with a collision-free `(seq, writerId)` total
order, eliminating the last-write-wins clobbering of the previous read-modify-write
model. Legacy `state.json` is migrated via a one-time `state_imported` genesis event.

Adds an explicit guarded lane state machine for orchestrator/autopilot task lanes
(`planned → claimed → in_progress → in_review → done`, plus `blocked`/`canceled`)
with dependency, evidence-for-terminal, and forced-transition guards; the
orchestrator persists lane transitions durably via the core log.

Subsumes the Append-Only Session Audit Trail (GH-580): verbatim user input and
approval prompt/response pairs are captured as audit events. The born-deduplicated
`events.jsonl` is retired — the observability timeline now derives from the audit
projection, and skill-lifecycle telemetry is relocated to
`.harness/metrics/skill-events.jsonl`.

BREAKING (internal): the deprecated `saveState`/`loadState` exports are removed;
all state reads/writes now flow through the event-sourced store.
