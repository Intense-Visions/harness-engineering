---
title: Event-Sourced State Model with Deterministic Reducer
status: draft
feature: event-sourced-state-model
roadmap: github:Intense-Visions/harness-engineering#598
subsumes: github:Intense-Visions/harness-engineering#580
keywords:
  [
    event-sourcing,
    deterministic-reducer,
    materialized-snapshot,
    state-machine,
    lane-guards,
    append-only-log,
    projections,
    provenance,
  ]
---

# Event-Sourced State Model with Deterministic Reducer

## Overview

Harness's machine state lives in a mutated `.harness/state.json`, read-modify-written
in place by every skill, CLI command, and MCP tool that touches it
(`packages/core/src/state/state-persistence.ts:9,40`). Under parallel/autopilot
execution this is last-write-wins: concurrent agents clobber each other's
`decisions`, `blockers`, and `progress`.

The orchestrator's task lifecycle is a _separate_ problem. It already has a pure
reducer (`packages/orchestrator/src/core/state-machine.ts:804` — `applyEvent`) but it
is ephemeral in-process, and its transitions are unguarded: no dependency checks, no
evidence required to reach terminal states, no forced-transition discipline.

This feature replaces the mutated state with an **append-only event log + deterministic
reducer (composed as projections) + materialized snapshot**, and adds an **explicit
guarded state machine** for orchestrator/autopilot task lanes. It is modeled on Spec
Kitty's `status/{emit,store,reducer,transitions}.py` ([SPECKITTY-1],
`docs/research/spec-kitty-comparison-analysis.md:42`). It **subsumes #580** (Append-Only
Session Audit Trail) by folding verbatim-input and approval prompt/response capture into
the same authoritative log.

**Strategy grounding.** `STRATEGY.md#our-approach` — "the substrate the agent runs on,
not the agent itself, determines reliability." State/provenance is harness's weakest
substrate and the root of several parallel-execution failure modes. A durable,
replayable decision/outcome log also advances the _Compounding feedback loops_ track
(`STRATEGY.md#tracks`) by giving skill-effectiveness baselines an honest event history.

## Goals

1. Make the event log the single source of truth; the materialized snapshot (and any
   `state.json`-shaped read) becomes a _derived_ artifact — `replay(events)`
   deterministically reproduces it.
2. Eliminate last-write-wins clobbering: concurrent writers append lock-free;
   deterministic order comes from an ordering key, not a held lock.
3. Give orchestrator/autopilot task lanes an explicit, guarded state machine:
   dependency guards, evidence required for terminal states, and forced-transition
   rules (`force` ⇒ `actor` + `reason`).
4. Provide a full, replayable audit trail (subsuming #580) and a _derived_ observability
   timeline, retiring the born-deduplicated `events.jsonl`.
5. Migrate existing on-disk state without loss (single `state_imported` genesis event)
   and without fabricating provenance.

## Non-Goals (YAGNI)

- No distributed/multi-machine coordination — single-repo, local filesystem only.
- No new review sub-states (`for_review`/`approved`) beyond the single `in_review` lane.
- No event log for `docs/roadmap.md` writes — a separate domain; its claim
  compare-and-set stays as-is.
- No reverse-engineered synthetic history for pre-migration state.
- No log compaction/checkpointing engine unless replay cost is demonstrated to matter
  (future consideration, not built now).

## Decisions Made

| ID  | Decision                                                                                                                                                                                                                                                           | Rationale                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Single spec covers both the event-log foundation **and** the guarded lane state machine.                                                                                                                                                                           | Chosen as one coherent design rather than two sequenced specs.                                                                                                                           |
| D2  | New richer snapshot schema (`schemaVersion: 2`) carrying `coreState` + `lanes` + `audit`; all readers migrate to a snapshot/projection API.                                                                                                                        | Lane state and provenance become first-class, not bolted onto the legacy `HarnessState`.                                                                                                 |
| D3  | Lock-free append (`O_APPEND`, one JSONL line under the platform's atomic single-`write()` size; oversized payloads spilled to a blob side-file); total order via `(seq, writerId)` (see INV-1/INV-2).                                                              | Removes last-write-wins clobber without a contention bottleneck. `O_APPEND` makes a single `write()` atomic at the OS level; keeping each line within one `write()` avoids interleaving. |
| D4  | Harness-native lane machine `planned → claimed → in_progress → in_review → done` + `blocked`/`canceled`, with dependency / evidence-for-terminal / forced-transition guards.                                                                                       | Delivers the three named guards using existing harness vocabulary; YAGNI-cuts review sub-states.                                                                                         |
| D5  | One unified authoritative log; retire born-deduplicated `events.jsonl` (existing entries are **discarded**, not imported — it was observability-only and lossy by design); subsume #580 as audit event types; observability timeline becomes a derived projection. | A true single source of truth; #598 genuinely closes #580 rather than merely complementing it.                                                                                           |
| D6  | Migrate legacy `state.json` via one honest `state_imported` genesis event, idempotent on **"a `state_imported` event is already present in the log"** (not merely "file exists" — an empty log from a crashed import must still import).                           | No data loss, no fabricated provenance, crash-safe re-run.                                                                                                                               |
| D7  | One log, multiple pure projections (`coreState`/`lanes`/`audit`) in `packages/core`.                                                                                                                                                                               | Canonical event-sourcing shape; each projection independently testable; lands incrementally.                                                                                             |

## Technical Design

### Event model

A discriminated union, zod-validated. Every event shares an envelope and carries a
type-specific payload:

```
Envelope: { seq: number, writerId: string, timestamp: string, scope: Scope, type: EventType, ... }
```

- **Core-state events:** `state_imported` (genesis), `decision_recorded`,
  `blocker_opened`, `blocker_resolved`, `position_set`, `progress_set`,
  `session_summarized`.
- **Lane events:** `task_registered` (with `dependsOn: string[]`), `lane_transitioned`
  (`from`, `to`, `force?`, `actor?`, `reason?`, `evidence?`).
- **Audit events (subsumes #580):** `user_input_captured` (verbatim), `approval_requested`,
  `approval_resolved`.

### Ordering

The total order rests on two invariants that the concurrency test (SC3) must exercise
directly:

- **INV-1 (writerId is globally unique and stable per process).** Each writer generates a
  `writerId` once at process start — a UUIDv4 (or `hostname:pid:random` fallback) — and
  reuses it for every append in that process. Uniqueness across concurrent agents is the
  property that makes `(seq, writerId)` collision-free; it is asserted, not assumed, and
  the concurrency test spawns writers with distinct ids and verifies no `(seq, writerId)`
  pair repeats.
- **INV-2 (seq is re-derived from the live tail on every append).** `lamportSeq` is **not**
  read from a cached in-memory `max`. Each `emitEvent` reads the current log tail's highest
  `seq` and writes `max(tailSeq, localCounter) + 1`, then advances its verified-monotonic
  `localCounter`. This prevents a single writer from emitting two events at the same
  `(seq, writerId)` from a stale max.

`timestamp` is human-facing only and is **never** the ordering authority. The reducer
imposes the deterministic total order at read time by sorting on `(seq asc, writerId asc)`.
Because `writerId` is globally unique (INV-1) and each writer's `seq` strictly increases
(INV-2), no two events share a key, so replay order is a _total_ order independent of
wall-clock skew. Two concurrent writers may legitimately produce the same `seq` with
different `writerId`s; the `writerId` tiebreak resolves this deterministically.

> Note: `(seq, writerId)` gives a deterministic Lamport-style order, **not** a real-time
> order — two genuinely concurrent events are ordered by tiebreak, not by which happened
> first in wall-clock terms. This is acceptable: the snapshot must be _deterministic and
> lossless_, not a real-time trace (that is what `timestamp` is for).

### Field-merge semantics

Append/set-valued core-state (`decisions`, `blockers`, `progress` entries keyed by id)
**union** across events — no concurrent write is ever lost. Scalar fields (`position`,
a `progress` entry's status) resolve by **deterministic last-event-wins**: the event with
the highest `(seq, writerId)` key wins. This is what Goal 2 means by "eliminate
last-write-wins clobbering": the old failure was a whole-snapshot read-modify-write
overwriting _unrelated_ fields another agent had just set; per-field events make that
impossible, and the residual scalar contention resolves deterministically rather than by
filesystem race.

### On-disk files

Resolved per `getStateDir` scope (global / stream / session — unchanged from today,
`packages/core/src/state/state-shared.ts:38`):

- `state.events.jsonl` — the authoritative append-only log.
- `state.events.blobs/<hash>.json` — spilled oversized event payloads (referenced by
  hash from the log line, keeping each line under the atomic-append size bound). The blob
  is written (atomically, temp + rename) **before** the referencing log line, so a
  **process crash** between the two writes leaves an orphan blob (harmless, GC-able),
  never a dangling reference. This ordering guarantee covers process crashes; it does not
  claim power-loss durability ordering (an `fsync` would be required for that, deliberately
  not paid for local dev state). Phase 1 pins the concrete atomic-append byte bound per
  platform/filesystem. Read-path resilience is symmetric: a missing or corrupt blob (or a
  schema-invalid line) skips that single event and is surfaced as a drop diagnostic — it is
  never allowed to abort the whole `loadEvents()` replay (a corrupt side-file is a cache
  miss, not data loss).
- `state.snapshot.json` — materialized snapshot (`schemaVersion: 2`), derived; carries
  `{ coreState, lanes, audit, meta: { lastSeq } }`. Written atomically (temp + rename,
  matching `state-persistence.ts:54`). A snapshot that is missing, stale, or fails to
  parse is **never authoritative** — readers fall back to `reduce(loadEvents())`, so a
  torn or corrupt snapshot is a cache miss, not data loss.

### Reducer / projections

`reduce(events) → Snapshot` composes three pure projections — `projectCoreState`,
`projectLanes`, `projectAudit` — each `(events) → subDocument`. Core invariant:

> **`reduce(loadEvents(scope)) === readSnapshot(scope)`** for all scopes.

**`projectCoreState` is the legacy bridge.** It produces a sub-document carrying exactly
the existing `HarnessState` fields (`position`, `decisions`, `blockers`, `progress`,
`lastSession` — `types.ts:72-117`) plus the new `schemaVersion: 2` extensions. A thin
`toHarnessState(snapshot.coreState)` adapter returns the legacy shape so existing readers
migrate by swapping `loadState(...)` for `toHarnessState(readSnapshot(...).coreState)`
with no field-shape change.

### Lane state machine

`lane-machine.ts` holds the transition table plus three pure guards, each returning a
`Result` so illegal transitions are `Err`, never silent:

- **`dependencyGuard`** — a task may not enter `in_progress` until every `dependsOn`
  task is `done`.
- **`evidenceGuard`** — entering `done` requires non-empty `evidence`
  (PR/commit/test refs).
- **`forceGuard`** — any transition not in the allowed table requires `force: true`
  with both `actor` and `reason`, recorded on the `lane_transitioned` event.

Allowed table: `planned→claimed`, `claimed→in_progress` (dependency guard),
`in_progress→in_review`, `in_review→done` (evidence guard), `in_review→in_progress`
(rework), `<any non-terminal>→blocked`, `blocked→<prior lane>`,
`<any non-terminal>→canceled`. Terminal lanes: `done`, `canceled`.

### API surface

- `emitEvent(projectPath, event, { scope })` — single mutation entry point; replaces
  `saveState` mutations and the legacy `emitEvent`. Lock-free append.
- `loadEvents(projectPath, { scope })` — ordered read.
- `readSnapshot(projectPath, { scope })` — returns the current snapshot. When
  `tailSeq > snapshot.meta.lastSeq` (or the snapshot is absent/corrupt) it **computes**
  the result via `reduce()` and returns it, and schedules a debounced `materialize`; it
  does not itself write on the read path, so concurrent reads do not stampede the snapshot
  file.
- `materialize(projectPath, { scope })` — the **sole writer** of `state.snapshot.json`:
  reduce + atomic temp/rename. Debounced and lazy; never blocks an `emitEvent` append.
- `transitionLane(projectPath, taskId, toLane, { evidence?, force?, actor?, reason? })` —
  validates via guards then emits `lane_transitioned`, or returns `Err`.

### Module layout

New `packages/core/src/state/event-sourcing/`:
`events.ts` (schema/types), `log.ts` (append + ordered read + ordering),
`projections/{core-state,lanes,audit}.ts`, `lane-machine.ts` (table + guards),
`snapshot.ts` (compose + materialize + staleness), `migrate.ts` (genesis import),
`index.ts` (barrel).

## Integration Points

### Entry Points

- `manage_state` MCP tool (`packages/cli/src/mcp/tools/state.ts:365`): mutating actions
  emit events; read actions read the snapshot; new `task-transition` action wraps
  `transitionLane`.
- `recordInteraction` / `emit_interaction`
  (`packages/cli/src/mcp/tools/interaction.ts:371`): emits audit + decision events.
- `gather_context` (`packages/cli/src/mcp/tools/gather-context.ts:320`): timeline reads
  the `audit` projection instead of `events.jsonl`.
- Orchestrator `state-machine.ts applyEvent`
  (`packages/orchestrator/src/core/state-machine.ts:804`): persists lane events via the
  core log.
- Remaining legacy `loadState` readers to migrate to
  `toHarnessState(readSnapshot(...).coreState)`:
  the `manage_state` read actions (`state.ts`), the state MCP resource
  (`packages/cli/src/mcp/resources/state.ts`), and the `state show` CLI command
  (`packages/cli/src/commands/state/show.ts`). The full set is bounded (~6 `loadState` +
  ~3 `saveState` call sites); Phase 3 enumerates and converts each.

### Registrations Required

- Core barrel-export regeneration for the new `event-sourcing/` module.
- `manage_state` MCP schema update (new `task-transition` action; read actions repointed
  to the snapshot).
- Retire or alias the legacy `events.ts` `emitEvent`.

### Documentation Updates

- AGENTS.md state section (event-sourced model, lane machine).
- `.harness/` on-disk layout docs (new log + snapshot + blobs).
- `manage_state` action reference.

### Architectural Decisions

- **D2 — event log authoritative; snapshot derived** warrants a standalone ADR: it
  inverts the state-ownership model the codebase has assumed since `schemaVersion: 1`.
- **D4 — guarded lane state machine** warrants a standalone ADR: it introduces a new
  cross-package contract (core owns the machine; orchestrator/autopilot consume it).

  (Pointers only — canonical decision text lives in **Decisions Made**.)

### Knowledge Impact

New concepts: append-only event log, projection/read-model, materialized snapshot, lane
state machine, transition guards, genesis migration. New relationship edges:
`snapshot —derived-from→ log`, `lanes-projection —uses→ guards`,
`audit-projection —subsumes→ #580`.

## Success Criteria

1. No code path mutates state via `saveState`; every mutation appends an event
   (grep-verifiable + tests).
2. **Property test:** `reduce(events) === readSnapshot()` for arbitrary event sequences.
3. **Concurrency test:** N processes (each with a distinct `writerId`, INV-1) appending
   concurrently lose zero events; no `(seq, writerId)` pair repeats (INV-1/INV-2); replay
   order via `(seq asc, writerId asc)` is deterministic and identical across runs.
4. **Guard tests:** off-table transition without `force` → `Err`; `force` without
   `actor`+`reason` → `Err`; `→ done` without `evidence` → `Err`; `→ in_progress` with
   unmet deps → `Err`.
5. #580 subsumed: a verbatim `user_input_captured` event and matching
   `approval_requested`/`approval_resolved` events are persisted for an
   `emit_interaction` round-trip and recoverable via the `audit` projection (test against
   a recorded interaction). On that artifact existing, the #580 roadmap row is closed.
6. `events.jsonl` retired; `gather_context` timeline still renders, now derived from the
   `audit` projection.
7. Legacy `state.json` migrated via one `state_imported` event; no data loss; a re-run is
   a no-op.
8. `harness validate` passes; all readers migrated to the snapshot/projection API.

## Implementation Order

- **Phase 1 — Log core:** event schema + ordering + lock-free append + ordered read +
  blob spill. Concurrency/ordering tests.
- **Phase 2 — Core-state projection + snapshot:** `projectCoreState`, `materialize`,
  staleness detection, `readSnapshot`. Property test `replay === snapshot`.
- **Phase 3 — Migration + write-path cutover:** genesis import; rewire `manage_state`
  mutating actions + `recordInteraction` to emit; remove `saveState` mutations; migrate
  readers to the snapshot API.
- **Phase 4 — Lane machine:** `projectLanes` + transition table + 3 guards +
  `transitionLane` + `manage_state task-transition`; refactor orchestrator `applyEvent`
  to persist via the log.
- **Phase 5 — Audit subsumption (#580):** audit event types; retire `events.jsonl`;
  derive timeline; update `gather_context`.
- **Phase 6 — Docs + ADRs:** AGENTS.md, `.harness/` layout, two ADRs, knowledge-graph
  entries, cleanup.
