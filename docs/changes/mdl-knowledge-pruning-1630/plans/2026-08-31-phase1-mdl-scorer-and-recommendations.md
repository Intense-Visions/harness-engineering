# Plan: Phase 1 — MDL scorer + prune/merge recommendations (report-only)

**Date:** 2026-08-31 | **Spec:** docs/changes/mdl-knowledge-pruning-1630/proposal.md | **Tasks:** 7 | **Time:** ~45 min | **Integration Tier:** small | **Rigor:** standard

## Goal

Land a pure `packages/core/src/knowledge-mdl` module that scores each
knowledge-store entry's **description cost** (tokens shipped per inclusion ×
inclusion frequency) against its **compression value** (a self-contained
present-vs-matched-absent comparison of run outcome cost), emits per-entry
`keep` / `prune` / `insufficient-evidence` verdicts and merge/consolidate
recommendations, and rolls them into a store-level MDL ledger. Wire a read-only
`harness knowledge mdl` CLI. **Executing** the prune/merge and consolidation onto
#1633's ablation harness are DEFERRED (see spec non-goals).

## Scope

Scorer + matched-comparison estimator + consolidation detector + report + adapter

- CLI report command + tests ONLY. No mutation of the store, no archive/tombstone
  execution, no #1633 dependency, no dashboard UI.

## Source-of-truth findings (verified)

- `LearningsIndexEntry` (`packages/core/src/state/learnings-content.ts:18`):
  `hash`, `tags`, `summary`, `fullText`. `computeEntryHash` gives stable ids.
- `checkOverlap` / `OverlapResult` (`learnings-overlap.ts:145`): reusable
  weighted overlap for the merge detector.
- `estimateTokens` (`compaction/envelope.ts:53`, `chars/4`): per-entry token
  estimate; the graceful fallback for description cost.
- `pruneLearnings` (`state/learnings-lifecycle.ts:70`) is **recency**-based
  (keep-20 + reversible archive) — MDL is the principled counterpart, not a
  replacement; the archive is the reversibility precedent.
- `RunRecord` / `UnitVerdict` (`orchestrator/src/core/flight-recorder.ts:46`):
  the per-run outcome-cost surface (`gateBlocks`, `attempt`, `verdict`).

## Tasks (implementation order)

1. **Types + config** — `knowledge-mdl/types.ts`: `KnowledgeEntry`,
   `InclusionEvent`, `RunOutcome`, `MdlVerdict`, `MdlConfig`,
   `DEFAULT_MDL_CONFIG` (min present/absent runs, min matched strata, prune
   margin, overlap threshold).
2. **Description cost** — `knowledge-mdl/cost.ts`: `computeDescriptionCost`. TDD
   `cost.test.ts`: inclusion count/frequency, total tokens, mean, description
   length; zero inclusions → zeroed cost.
3. **Matched comparison** — `knowledge-mdl/matched-comparison.ts`:
   `estimateCompressionValue` (self-contained present-vs-matched-absent,
   stratified, weighted, with stderr + sufficiency). TDD
   `matched-comparison.test.ts`: value positive when present runs cost less;
   insufficient when a cell/stratum is under-populated; never fabricates a value
   from absence.
4. **Score** — `knowledge-mdl/score.ts`: `scoreEntry` → `EntryScore` with
   `netMdl` + verdict. TDD `score.test.ts` (acceptance #1 + #3): seeded worthless
   vs high-value entry separated; insufficient-evidence entry NEVER pruned;
   verdicts carry a rationale; recommendations reversible (no mutation).
5. **Consolidate** — `knowledge-mdl/consolidate.ts`: `findMergeCandidates`
   (overlap cluster via `checkOverlap`, union vs sum description length). TDD
   `consolidate.test.ts` (acceptance #2): seeded overlapping entries → union
   length < sum length at equal measured value; non-overlapping → no candidate.
6. **Report + adapter + barrel** — `knowledge-mdl/report.ts`
   (`buildMdlReport` store-level ledger, ranked prune/merge candidates,
   insufficient set, reversible tombstone plan), `knowledge-mdl/adapter.ts`
   (`buildKnowledgeEntriesFromLearnings`), `knowledge-mdl/index.ts` barrel; add
   `export * from './knowledge-mdl'` to `packages/core/src/index.ts`. TDD
   `report.test.ts`: empty inputs → zeroed ledger, all insufficient, never
   throws; totals reconcile.
7. **CLI** — `packages/cli/src/commands/knowledge/index.ts`
   `createKnowledgeCommand` with an `mdl` subcommand (`--json`, `--path`,
   optional `--telemetry <file>`), register in `_registry.ts`. Loads learnings,
   reads optional inclusion/outcome telemetry, prints the cost/value ledger +
   pending prune/merge candidates; honest "insufficient evidence — no inclusion
   telemetry" degradation. Regenerate reference docs.

## Verification

- `pnpm --filter @harness-engineering/core test` green for the 5 new suites.
- `node packages/cli/dist/bin/harness.js knowledge mdl --json` on this repo
  returns a well-formed ledger (dogfood; expected all-insufficient without
  inclusion telemetry).
- Fixture asserts seeded worthless entry → `prune`, high-value → `keep`.
- Fixture asserts overlapping-entry union length < sum at equal value.
- Fixture asserts insufficient-evidence entry never pruned.

## Deferred (tracked on #1630 via `Refs`)

Executing the prune/merge (archive/tombstone/delete); wiring the MDL pass as a
mutating knowledge-pipeline step; consolidation onto #1633's rate-distortion
ablation harness and #1621's skill-P&L matched-comparison machinery; dashboard
trend UI.
