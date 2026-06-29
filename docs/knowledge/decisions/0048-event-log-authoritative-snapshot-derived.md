---
number: 0048
title: Event Log Is Authoritative; Snapshot Is Derived
date: 2026-06-27
status: accepted
tier: large
source: docs/changes/event-sourced-state-model/proposal.md
---

## Context

Harness machine state has lived in a mutated `.harness/state.json`,
read-modify-written in place by every skill, CLI command, and MCP tool that
touched it (`packages/core/src/state/state-persistence.ts`). The codebase has
assumed this single-owner, mutate-in-place model since `schemaVersion: 1`. Under
parallel and autopilot execution that model is last-write-wins: a
whole-snapshot read-modify-write overwrites unrelated `decisions`, `blockers`,
and `progress` fields that a concurrent agent had just set. This is the root of
several parallel-execution failure modes (spec §Overview, §Goals).

The fix has to invert the ownership model without breaking the dozens of
existing `HarnessState`-shaped readers.

## Decision

Records **D2** from the spec's Decisions Made table (canonical text lives there;
this ADR is a pointer, per spec-craft SPEC-R004 — see also D3/D6/D7).

The append-only event log (`state.events.jsonl`) is the **single source of
truth**. The materialized snapshot (`state.snapshot.json`, `schemaVersion: 2`,
carrying `{ coreState, lanes, audit, meta.lastSeq }`) is a **derived cache**, not
an authority. The defining invariant is:

> `reduce(loadEvents(scope)) === readSnapshot(scope)` for every scope.

A snapshot that is missing, stale (`tailSeq > meta.lastSeq`), or fails to parse
is treated as a **cache miss**: readers fall back to `reduce(loadEvents())` and
schedule a debounced refresh; a torn or corrupt snapshot is never data loss.
Append-/set-valued core-state (`decisions`, `blockers`, `progress` entries) unions
across events so no concurrent write is lost; scalar fields (`position`, a
`progress` entry's status) resolve by **deterministic last-event-wins** on the
`(seq, writerId)` ordering key (INV-1/INV-2), not by filesystem race.

## Consequences

- All `HarnessState` readers migrate from `loadState(...)` to
  `toHarnessState(readSnapshot(...).coreState)`; `projectCoreState` is the legacy
  bridge that preserves the existing field shape, so readers change one call, not
  their data model.
- `materialize` is the **sole writer** of `state.snapshot.json` (atomic temp +
  rename); the read path never writes, so concurrent reads do not stampede.
- The deprecated `saveState`/`loadState` persistence functions are dead: every
  mutation appends an event; their definitions are removed (SC1 guard).
- A whole-snapshot overwrite of unrelated fields is now structurally impossible;
  the only residual contention — two writers setting the same scalar — resolves
  deterministically rather than by which `write()` landed last.
- Replay is deterministic and independent of wall-clock skew (`timestamp` is
  human-facing only), giving an honest, replayable decision/outcome history.

See also: the concept doc [`event-sourced-state.md`](../core/event-sourced-state.md)
and the companion ADR [0049](0049-guarded-lane-state-machine.md).
