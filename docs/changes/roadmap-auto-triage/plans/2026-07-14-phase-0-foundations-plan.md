# Plan: Roadmap Auto-Triage — Phase 0 (Foundations / Shared Contracts)

## Goal

Pin the **horizontal contracts** that Phases 1/3/4 each assume but none owns:
the triage record data model, the config schema, the scheduling seam, and the
entity extractor. These land before/alongside Phase 1 so the vertical slices build
against one source of truth instead of re-deriving it three times.

## Why this exists

The phase plans each describe the shared data model, config, and scheduling as an
"uncertainty." That's three definitions of one thing. This doc makes them one, and
assigns single ownership so a later phase _consumes_ the contract rather than
redefining it.

## Scope Guards (do NOT do in this plan)

- No probe logic, brainstorm, dispatch, or retrospective — those are Phases 1–4.
  This is only the substrate they share.
- No live scheduling turned on — register the seam default-disabled.
- No behavior change: every contract here is inert until a phase uses it and the
  feature is enabled.

---

## Contract 1 — The triage record (data model)

One record per roadmap item, keyed by its stable **`externalId`**
(`packages/core/src/roadmap/parse.ts:233`). It accretes across the pipeline; each
phase writes its own slice and never rewrites another's:

```
TriageRecord {
  externalId: string            // stable item key
  shapeKey: string              // bucketing key (see below) — for precedent/ratchet
  prediction?: {                // written by Phase 3 at dispatch
    verdict: ComplexityVerdict  // the pre-diff prediction being made
    levers: {...}               // Phase-1 probe lever results
    scopeEstimate: number       // predicted blast radius
    ratchetStage: 1|2|3|4       // stage in effect at dispatch
  }
  outcome?: {                   // written by Phase 4 at retrospective
    actual: ComplexityVerdict   // full-strength post-diff verdict
    exceededBy: number          // 0 = matched; >0 = mispredict magnitude
    matched: boolean
  }
  ts: string                    // stamped by the writer (not in-script)
}
```

- **`shapeKey`** = the precedent/ratchet bucket. Definition: `sortedLabels + '|' +
escalationCategory + '|' + predictedLevel`. The precedent lever base-rate and the ratchet
  both aggregate records by this key. Defining it _here once_ is what lets P1's
  `PrecedentLookup` and P4's ratchet agree without coupling.
- **The precedent lever** is a pure aggregation over records sharing a `shapeKey`
  with a populated `outcome` — success rate = `matched / total`. Absent history ⇒
  `unknown` (P1 degrade-empty), which is simply "no records for this shape yet."
- **Storage:** an append-only outcome log, reusing the event-sourced state
  substrate (`packages/core/src/state/event-sourcing/log.ts`) rather than a new
  store; predictions and outcomes are separate appends keyed by `externalId`.
  Rationale: replay-safe, matches how `recordOutcome` state already works, and
  avoids a bespoke DB.

**Ownership:** the _type_ + the store read/write helpers live here (Phase 0). P1
consumes `PrecedentLookup` (read), P3 writes `prediction`, P4 writes `outcome` and
implements the real `PrecedentLookup`.

## Contract 2 — Config schema (`roadmap.autoTriage`)

The whole surface, defined once, **default-off**, wired in _both_ the TS type and
the Zod schema (per the AMR lesson `[[amr-config-file-surface-unwired]]` — a
type-only add is silently rejected at validate):

```
roadmap.autoTriage: {
  enabled: boolean            // default false — master switch
  schedule?: string           // cron; default undefined (on-demand only)
  ratchetStage: 1|2|3|4        // default 1 (human before execution)
  thresholds: {
    dispatchConfidence: 'medium'  // pre-diff ceiling (S3-001); the gate bar
    boundedScopeMax: number       // blast-radius ceiling for "bounded" (seed)
    brainstormConfidence: number  // per-fork auto-accept bar (P2)
    exceededByBands: number       // level-delta that counts as mispredict (P4)
    ratchetAdvanceRate: number    // success-rate to advance a stage (P4)
    ratchetMinSample: number      // min records before advancing (P4)
  }
  depthBudget: { trivial: n; simple: n }  // brainstorm depth by level (P2)
}
```

All `thresholds` are documented seeds (tunable), mirroring AMR's `STATIC_WEIGHTS`
comment style. **Ownership:** schema + defaults here; each phase reads its fields.

## Contract 3 — Scheduling seam

Register a triage job on the existing maintenance substrate
(`packages/orchestrator/src/maintenance/task-registry.ts` +
`scheduler.ts` + `cron-matcher.ts`), **leader-elected**
(`leader-elector.ts`) so concurrent orchestrators don't double-run it (the
duplicate-dispatch hazard, memory `[[orchestrator-duplicate-dispatch]]`). Job body
is injected by later phases (P1 = report; P3+ = mark; wired progressively).
Registered **disabled** unless `enabled && schedule` are set; on-demand CLI path
always works regardless. **Ownership:** registration + leader-gating here; job body
supplied by phases.

## Contract 4 — Entity extraction (scope-lever dependency)

A shared pure util `extractEntities(text)` → candidate symbol/path names for the
graph lookup. Start naive (identifiers, `path/like/this`, backticked tokens,
CamelCase); NLQ (`packages/graph/src/nlq/`) is a later upgrade. **This is
load-bearing** — if it's weak, the scope lever yields nothing and the probe collapses to
the length proxy, so it ships here with its own tests, not buried in P1.
**Ownership:** here; P1's probe consumes it.

## Grounding (evidence: file:line)

- Item key: `packages/core/src/roadmap/parse.ts:233` (`externalId`).
- Persistence substrate: `packages/core/src/state/event-sourcing/log.ts`;
  outcome-record precedent (`packages/core/src/state/learnings*.ts`).
- Scheduling: `packages/orchestrator/src/maintenance/{task-registry,scheduler,
cron-matcher,leader-elector}.ts`.
- Config wiring rule: `packages/orchestrator/src/workflow/schema.ts` +
  `config.ts` (extend Zod, not just the type).
- NLQ upgrade path: `packages/graph/src/nlq/`.

## Tasks

### Task 1: `TriageRecord` type + `shapeKey` (`intelligence/src/triage/record.ts`)

**Depends on:** none | **Files:** `…/triage/record.ts`, `record.test.ts`,
barrel | **Category:** types+test
The record type, `shapeKey(labels, category, level)` (pure, deterministic,
order-independent on labels), and the `PrecedentLookup` interface P1 injects.

### Task 2: Outcome-log store helpers

**Depends on:** Task 1 | **Files:** store helpers over
`state/event-sourcing/log.ts`, tests | **Category:** impl
Append `prediction` / `outcome` keyed by `externalId`; read-back; a pure
`aggregatePrecedent(records)` → base-rate by `shapeKey` (returns `unknown` on
empty). This is the real `PrecedentLookup` P4 will wire; P1 uses the empty path.

### Task 3: Config schema (`roadmap.autoTriage`)

**Depends on:** none | **Files:**
`packages/orchestrator/src/workflow/schema.ts`, `config.ts` | **Category:** impl
Full surface above, default-off, **type + Zod both**; a `harness validate` test
that the config is accepted (guards the AMR-style schema drift). Seed thresholds
documented.

### Task 4: Entity extractor (`extractEntities`)

**Depends on:** none | **Files:** `…/triage/entities.ts`, `entities.test.ts` |
**Category:** impl+test
Naive extraction with tests over real roadmap-row shapes; explicit "no entities
found ⇒ empty" (which P1 turns into `unresolved-scope`, never a length fallback).

### Task 5: Scheduling registration (disabled seam)

**Depends on:** Task 3 | **Files:** maintenance task-registry wiring, test |
**Category:** impl
Register a leader-gated triage job that no-ops unless `enabled && schedule`; body
is a supplied callback (empty here). Test: disabled by default, single-leader.

### Task 6: `[checkpoint:human-verify]` — foundations land green

**Depends on:** Tasks 1–5 | **Files:** none | **Category:** integration
`harness validate` clean with config present-but-off; store round-trips a
prediction+outcome; entity extractor sane on real rows; scheduler dormant. No
behavior change with the feature off.

## Sequencing

T1 → T2 (persistence); T3, T4 parallel (independent); T5 after T3; T6 last.
T1/T3/T4 unblock Phase 1; T2 unblocks P4; T5 unblocks the "regular basis" schedule.

## Traceability

Contract 1 → T1/T2 (consumed by P1 read, P3 write, P4 write+aggregate);
Contract 2 → T3 (read by all phases); Contract 3 → T5; Contract 4 → T4 (P1 scope lever).
Resolves the proposal open questions: precedent recording (Contract 1), marker/
scheduling (Contract 3), and "how outcomes feed the precedent lever" (already D13, now with a
concrete store).

## Concerns

- **`shapeKey` is the quiet linchpin** — too coarse and precedent lumps unlike work
  together (unsafe base-rates); too fine and every item is its own bucket (the precedent lever
  is perpetually `unknown`, ratchet never advances). Start moderate; make it the
  first thing Phase 4's calibration revisits.
- Reuse the event-sourced log; a bespoke store re-invents replay/concurrency the
  substrate already handles.
- Entity extraction quality caps the whole probe — treat a weak extractor as a
  Phase-1 blocker, not a nicety.
