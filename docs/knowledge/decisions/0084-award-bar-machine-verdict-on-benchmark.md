---
number: 0084
title: Award-bar machine verdict on BENCHMARK output
date: 2026-08-06
status: accepted
tier: medium
source: docs/changes/design-craft-award-bar/proposal.md (Decisions D1–D4)
---

## Context

The design-craft BENCHMARK phase scores a target against curated exemplars on
a 5-dimension radar and emits `overall.score` (0–100), `min(confidence)`, and
narrative `gaps`. It emitted no machine verdict on whether the target reached
"award tier" — so consuming agents fell back to free-hand judgment ("~82,
rising") when asked "is this good enough?". "Award tier" existed only as prose
describing the exemplars (ADR 0082), never as a threshold the target had to
clear.

## Decision

Add `awardBar` — a machine-derived verdict (`cleared | not-cleared |
indeterminate`) — to every `BenchmarkScore`, computed by a pure function
(`phases/award-bar.ts`), never emitted by the LLM.

1. **Per-dimension, not a single overall threshold.** ADR 0082 diagnosed pages
   scoring 88–94 _overall_ while carrying template tells; an equal-weight mean
   hides the weak axis. Each radar dimension must clear its own floor, so the
   verdict fails on the exact axis that is weak. Consistent with ADR 0019
   (never collapse the axes).

2. **Hybrid exemplar-relative floor.** Per dimension, the floor is
   `max(dimensionFloor, round(fraction × median(cited-exemplar references)))`.
   The corpus defines the bar (no magic "award tier" constant); the config
   floor keeps it from eroding; the **median** makes it robust to one weak
   exemplar. Tunable via `design.craft.benchmark.awardBar` (`dimensionFloor`
   80, `fraction` 0.95, `confidenceFloor` medium).

3. **Low confidence forces `indeterminate`.** If any dimension's confidence is
   below `confidenceFloor`, the verdict is `indeterminate` regardless of
   scores — a score the model is unsure about must never certify award tier.
   Honors ADR 0018/0019.

4. **Authority in TypeScript.** The LLM emits only the radar it always has; the
   verdict is derived in code. Mirrors the authority-in-TS pattern of
   outcome-eval / acceptance-eval.

## Consequences

- Downstream agents read `scores[].awardBar.verdict` instead of guessing;
  `shortfalls` names the dimensions to fix.
- The bar tracks the corpus: adding stronger MarketingPage exemplars raises it
  automatically; the median + config floor bound how fast and how low it moves.
- No change to how the radar is scored, no new exemplars, no vision-mode
  change. `awardBar` is additive on `BenchmarkScore`.
- No markdown renderer for BENCHMARK scores exists yet, so the verdict is
  surfaced on the structured output only; rendering is deferred to whenever a
  benchmark-score report surface is introduced.
- CRAFT_SCORE graph-node authoring is still unimplemented; when it lands,
  `awardBar.verdict` should become a queryable attribute on the node.
