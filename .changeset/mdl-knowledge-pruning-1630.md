---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(knowledge-mdl): score the knowledge store by Minimum Description Length —
description cost vs measured compression value — and report reversible
prune/merge recommendations (#1630).

Adds a pure `knowledge-mdl` module to `core` that applies MDL as the knowledge
store's fitness function: each entry's **description cost** (tokens shipped per
inclusion × inclusion frequency) is weighed against its **compression value** — a
**self-contained**, stratified, present-vs-matched-absent comparison of run
outcome cost (re-derivation / wrong turns / rework) that carries uncertainty and
a first-class `insufficient-evidence` verdict. Entries whose measured value does
not cover their cost are flagged **prune**; overlapping entries whose union
compresses better than their sum are flagged **merge/consolidate** (reusing the
existing `checkOverlap` similarity). Rolls the per-entry verdicts into a
store-level MDL ledger and exposes it as a read-only `harness knowledge mdl`
subcommand (`--json`, optional `--telemetry`).

Pruning requires measured worthlessness, never measurement absence: with no
inclusion/outcome telemetry every entry scores `insufficient-evidence` and is
retained.

Scope note: this slice is a report-only scorer + recommendations. **Executing**
the prune/merge is deferred, and the matched-comparison estimator is deliberately
self-contained — consolidating it onto #1633's rate-distortion ablation harness
and #1621's skill-P&L machinery is a deferred follow-up (see `Refs #1630`).
