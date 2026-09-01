# Never emit a ranked list without a stability check (#1529)

**Status:** Draft · **Tier:** Medium · **Domain:** core / ranking
**Route:** feature · **Stage trace:** brainstorming → autopilot (plan → execute → verify → review)
**Keywords:** ranking, stability, rank-correlation, Spearman, tiers, two-window, banding, dogfood

## Problem (brainstorming)

Every ordered output the harness emits — hotspots, risk areas, craft targets, critical
paths, skill recommendations — is a ranking computed from noisy signal. A 90-day telemetry
study across a 1,957-repository organisation (two independent 45-day windows, every figure
cross-validated against a second oracle) surfaced two failure modes that apply to **all** of
them:

1. **Non-reproducible order.** Individual rank position moved a mean of 12–15 places between
   two adjacent windows (Spearman rho ~0.62 overall, near zero in the middle band). Only broad
   _tier membership_ was reproducible; the precise order was noise presented as signal.
2. **Mean-of-two-windows banding.** Defining bands by the _mean_ of two measurements forces
   those measurements to anti-correlate within a band, producing impossible negative
   correlations — an invalid analysis that looks authoritative.

Both are methodological traps. This work turns them into a mechanical guard.

## Deliverables

- **Shared library** (`packages/core/src/ranking/`): any ranked output can be computed over
  two windows; the rank correlation between them is measured (tie-corrected Spearman) and
  reported alongside the output; below a correlation threshold the ranking **degrades to
  tiers** rather than being presented as a precise order.
- **Bands defined on one window, validated against the other — never on the average.** The
  banding API (`assignTiers`) accepts a _single_ window's ordered items, so the
  mean-of-two-windows bug is impossible by construction; `validateBands` re-bands the shared
  items on the secondary window alone and reports tier agreement.
- **Wired into a primary emitter** (the hotspot / churn ranking behind
  `harness compound scan-candidates`), which naturally computes over git time windows — the
  honest dogfood the roadmap shard asks for.

## Design

The library is pure and dependency-free.

- `ScoredItem { id; score }` — a ranked item with a cross-window-stable identity.
- `RankingWindow<T> { label; items }` — one window's items plus its human-readable definition.
  The `label` is carried into the report so every emitted ranking shows both window
  definitions.
- `spearmanRankCorrelation(primary, secondary)` — tie-corrected Spearman (Pearson over
  fractional ranks) computed over the items the two windows share. Fewer than two shared items
  reports correlation 0 (unstable) so a thin overlap never certifies an order.
- `assignTiers(ordered, tierCount)` — partitions an _already-ordered single-window_ list into
  contiguous rank bands (tier 1 = highest). No parameter accepts an averaged score.
- `validateBands(tiers, secondary)` — re-bands the shared items on the secondary window alone
  and reports the fraction that keep their tier.
- `checkRankStability(primary, secondary, options)` — the gate. Returns a `StableRanking`
  carrying a `StabilityReport { correlation, stable, presentation, correlationThreshold,
sampleSize, windows }` and **exactly one** of `ordered` (stable) or `tiers` + `bandValidation`
  (unstable). Default threshold 0.7, default 4 tiers.

### Wiring

`computeStableHotspots({ cwd, threshold, window })` computes churn over the most-recent
`window` and the equal-length window immediately before it, then runs the gate. The
`scan-candidates` command consumes the gate result: the emitted candidate report carries the
stability line (correlation + both window definitions) and, when unstable, groups hotspots by
tier instead of presenting a spurious order.

## Scope decision — this is a slice (`Refs #1529`)

This PR ships the **shared library in full** and wires it into **one** emitter (hotspots /
`scan-candidates`), chosen because its two-window computation is real (git history) rather than
synthetic. The shared library is the reusable substrate the remaining emitters adopt with a few
lines each; they are **not** wired here and remain uncovered:

- Critical paths (`packages/core/src/performance/critical-path.ts`)
- Craft-fleet / audit target ranking
- Skill recommendations (`packages/cli/src/skill/recommendation-engine.ts`)
- Graph anomaly / hotspot adapters (`packages/graph/src/entropy/*`)

Each is a follow-up that constructs two `RankingWindow`s from its own signal and calls
`checkRankStability`. Filed as the remaining work on #1529.

## Acceptance criteria

- [x] A synthetic unstable ranking degrades to tiers; a stable one stays ordered — both covered
      by tests (`stability.test.ts`).
- [x] Every ranked output carries its correlation and window definitions (`StabilityReport`
      always populates `correlation` + `windows`; the scan-candidates report renders the
      stability line).
- [x] The mean-of-two-windows banding bug is impossible by construction — `assignTiers` takes a
      single window's ordered items only; `validateBands` uses the secondary solely to validate.

## Non-goals

- Rewiring every ranked emitter (a slice; see scope decision).
- Choosing the "right" correlation threshold per emitter — 0.7 is a sane default, overridable.
- A configuration surface beyond thresholds (the roadmap shard explicitly asks for none).

## Assumptions

- Stability = rank-order robustness measured as cross-window rank correlation, with near-tie
  fragility captured by the tie-corrected Spearman over fractional ranks.
- Two adjacent, equal-length windows are the reproducibility probe (mirrors the origin study's
  two 45-day windows); for hotspots they are derived from git history.
- Wired into the shared ranked-list emitter (hotspots); other emitters named above are
  uncovered in this slice.
