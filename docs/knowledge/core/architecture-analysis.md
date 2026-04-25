---
type: business_concept
domain: core
tags: [architecture, metrics, baselines, stability, timeline]
---

# Architecture Analysis

The architecture module continuously monitors structural health across seven metric categories and maintains baselines for regression detection.

## Seven Metric Categories

1. **circular-deps** — Cycles in the dependency graph
2. **layer-violations** — Imports crossing defined layer boundaries
3. **complexity** — Cyclomatic complexity exceeding thresholds
4. **coupling** — Fan-in/fan-out exceeding limits
5. **forbidden-imports** — Imports matching forbidden patterns
6. **module-size** — File count or LOC exceeding module budgets
7. **dependency-depth** — Transitive dependency chain length

## Baseline Management

The `ArchBaselineManager` captures point-in-time snapshots of all metrics to `.harness/arch/baselines.json`. Each baseline records: commit hash, timestamp, per-category aggregate value, and an allowlist of known violation IDs. New violations fail CI; pre-existing violations from the baseline are allowed.

## Violation Identity

Violations have stable IDs computed as a hash of `filepath:category:detail`. This enables tracking individual violations across baselines and distinguishing regressions from known debt.

## Stability Score

A composite 0-100 score derived from per-category health values, each normalized against its threshold. Declining trends flag architectural risk. Scores are captured in TimelineSnapshots for historical trend analysis.

## Timeline Snapshots

Periodic `TimelineSnapshot` records capture stabilityScore, per-category aggregates, commit hash, and timestamp. These enable trend analysis, failure prediction, and reporting on whether architecture is improving or decaying over time.
