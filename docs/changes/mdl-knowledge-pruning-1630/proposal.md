# Proposal: MDL knowledge pruning — description length as the knowledge store's fitness function (#1630)

**Route:** feature · **Stage:** brainstorming → autopilot · **Scope:** report-only MDL scorer + prune/merge **recommendations** ONLY (executing the prune/merge DEFERRED; consolidation onto #1633's ablation harness DEFERRED)

## Problem

An unpruned knowledge store converges on negative value: each entry taxes every
context that includes it while duplicates and dead facts accumulate. Knowledge
stores today have no fitness function — every session appends learnings, none
are scored, and the store's marginal entry eventually costs more context than it
saves. Minimum Description Length is the principled objective the layer lacks:
the best model of a corpus is the one that most compresses it — a knowledge
entry is only knowledge if the cost of storing and shipping it is less than the
cost of the errors and re-derivations it prevents.

## Confirmed scope (orchestrator default, recorded as a fleet assumption)

Build **only** a report-only MDL scorer + prune/merge **recommendations** over
the existing learnings/knowledge store:

- **Per-entry description cost** — tokens shipped per inclusion × inclusion
  frequency, from context-assembly telemetry.
- **Per-entry compression value** — a **self-contained** matched comparison of
  run outcomes in runs where the entry was present vs matched runs where it was
  absent, with uncertainty and a first-class **insufficient-evidence** verdict.
- **Recommendations** — entries whose measured value does not cover their
  description cost → **prune**; overlapping entries whose union compresses better
  than their sum → **merge/consolidate**. Recommendations are **reversible by
  construction** (tombstone plan, never deletion).
- A **store-level MDL ledger** — total description length vs total measured
  value, with the pending prune/merge candidates.

**Explicitly deferred (out of scope for this slice):**

- **Executing** the pruning/merging — this slice recommends only; no entry is
  archived, tombstoned, or deleted by this code. `Refs #1630` keeps the issue
  open for manual reconciliation of the execution follow-up.
- **Consolidating onto #1633's rate-distortion ablation harness** — that issue
  is being built by a sibling lane right now and is NOT merged; this slice's
  matched-comparison estimator is deliberately **self-contained**. Consolidation
  onto #1633 and the skill-P&L matched-comparison machinery (#1621) is a deferred
  follow-up.

## Existing surfaces to extend (not reinvent)

Grepped the knowledge/telemetry surfaces so this extends them:

- `packages/core/src/state/learnings-*.ts` — the learnings store. `LearningsIndexEntry`
  (`hash`, `tags`, `summary`, `fullText`), `loadRelevantLearnings`, and the
  recency-based `pruneLearnings` (keep-20 + reversible archive under
  `.harness/learnings-archive/`). MDL is the **principled** counterpart to that
  hand/recency curation; the archive is the reversibility precedent.
- `packages/core/src/state/learnings-overlap.ts` — `checkOverlap` /
  `OverlapResult` (weighted lexical + structural + root-cause + code-reference
  similarity). Reused directly for the **merge/consolidate** detector.
- `packages/core/src/context/attribution.ts` — context-assembly attribution
  (`ContextSurfaceEntry`, per-entry token attribution). The **description-cost**
  surface: this is where "tokens shipped per inclusion" is measured.
- `packages/core/src/compaction/envelope.ts` — `estimateTokens` (`chars/4`
  heuristic), the graceful per-entry token estimate when measured inclusion
  tokens are absent.
- `packages/orchestrator/src/core/flight-recorder.ts` — `RunRecord` /
  `UnitVerdict` under `.harness/black-box/<runId>/run.json`: per-run outcome
  signals (`gateBlocks`, `attempt`, `verdict`). The outcome-cost surface the
  matched comparison consumes.

## Approach

A pure `packages/core/src/knowledge-mdl` module over three explicit telemetry
inputs (so it degrades gracefully and never invents evidence):

1. **`KnowledgeEntry`** — `{ id, tokensPerInclusion, tags?, text? }` — one
   scored store entry.
2. **`InclusionEvent`** — `{ entryId, runId, tokensShipped }` — one time an
   entry was shipped into a run's assembled context.
3. **`RunOutcome`** — `{ runId, stratum, cost }` — a run's re-derivation /
   wrong-turn / rework cost (expressed in tokens so both MDL sides share one
   currency), with a `stratum` matching-covariate key.

Modules:

1. **`cost.ts`** — `computeDescriptionCost(entryId, inclusions)`: inclusion
   count, total tokens shipped, mean tokens/inclusion, and the entry's
   **description length** (total tokens it taxed across all inclusions).
2. **`matched-comparison.ts`** — `estimateCompressionValue(entryId, inclusions,
outcomes, config)`: partition runs into **present** (entry included) vs
   **absent**, **stratify** by `RunOutcome.stratum`, and average the
   per-stratum (absentCost − presentCost) cost reduction weighted by present
   count. Emits `value` (tokens of cost avoided per present run), `stderr`,
   matched-strata count, and a `sufficient` flag with a `reason`.
   **Self-contained** — no dependency on #1633.
3. **`score.ts`** — `scoreEntry(...)`: combines description cost against
   compression value into `netMdl` and a verdict. **`insufficient-evidence`
   whenever the matched comparison is not sufficient — such entries are NEVER
   pruned** (measured worthlessness, never measurement absence). Only a
   sufficient, net-negative entry earns `prune`.
4. **`consolidate.ts`** — `findMergeCandidates(entries, config)`: cluster
   overlapping entries via `checkOverlap`, model the merged entry's **union**
   description length (deduplicated token content), and recommend a merge only
   when `unionLength < sumLength` **at equal measured value**.
5. **`report.ts`** — `buildMdlReport(...)`: the store-level ledger — total
   description length vs total measured value, ranked prune candidates, merge
   candidates, and the insufficient-evidence set. Report-only; recommendations
   are tombstone plans, not mutations.
6. **`adapter.ts`** — `buildKnowledgeEntriesFromLearnings(entryTexts)`: grounds
   `KnowledgeEntry` ids in the real store (`computeEntryHash`) with
   `estimateTokens` per-inclusion cost. Inclusion/outcome telemetry is supplied
   by the caller; absent telemetry → every entry scores `insufficient-evidence`.
7. **CLI** — `harness knowledge mdl` (`--json`): loads learnings, reads optional
   inclusion/outcome telemetry, prints the cost/value ledger + pending prune and
   merge candidates. Honest degradation: with no inclusion telemetry every entry
   is `insufficient-evidence` — the correct first-class verdict.

## Acceptance criteria

- [ ] A seeded worthless entry and a seeded high-value entry are correctly
      separated by the scorer on fixture telemetry (`score.test.ts`).
- [ ] Consolidation of seeded overlapping entries reduces total description
      length at equal measured value (`consolidate.test.ts`).
- [ ] No entry is pruned on insufficient evidence (audited) and every
      recommendation is reversible (tombstone plan, no deletion) in fixtures
      (`score.test.ts`, `report.test.ts`).
- [ ] Pure core module; graceful degradation when a telemetry surface is absent
      (empty inputs → zeroed ledger, all `insufficient-evidence`, never throws).

## Non-goals

Executing the prune/merge (archiving, tombstoning, deleting entries); wiring the
MDL pass into the knowledge pipeline as a mutating step; the dashboard trend UI;
consolidation onto #1633's ablation harness or #1621's skill-P&L machinery;
changing how learnings are recorded upstream.
