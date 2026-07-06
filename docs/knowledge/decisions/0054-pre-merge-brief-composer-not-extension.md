---
number: 0054
title: Pre-merge brief is a composer, not an extension of review-ci
date: 2026-07-02
status: accepted
tier: medium
source: docs/changes/senior-accountability-surface/proposal.md
---

## Context

The senior-engineer accountability surface (spec #569) needs a senior-facing
pre-merge brief on every PR: diff summary, multi-persona review verdict,
outcome-eval result, curated signal status, and a "worth your eyes" section.

The multi-persona review already runs on every PR (`review-ci`) and can already
post its verdict as a PR comment (`review-ci --comment`, `buildReviewBody`). The
question was whether the brief should be built by **extending** `review-ci`'s
comment body with the extra sections, or by a **separate composer** that consumes
review-ci's output alongside the other inputs.

## Decision

The brief is a **separate composer** — a new `harness pre-merge-brief` command
that consumes the `review-ci --json` verdict artifact plus live signals and graph
`execution_outcome` nodes, and renders one sticky PR comment. `review-ci` is left
unchanged; it remains a focused review gate and the single source of review truth.

Rejected alternatives:

- **Extend `buildReviewBody`.** Overloads the review gate with non-review concerns
  (signals, outcome-eval, diff summary), muddying its single responsibility and
  coupling the brief's lifecycle to the gate's.
- **Regenerate everything standalone.** Re-running the review inside the brief
  would create two sources of review truth that drift, and double the (expensive)
  LLM review cost.

## Consequences

- The brief degrades section-by-section: a missing review artifact, absent signal
  store, or unevaluated outcome each renders an "unavailable" line independently,
  and the command still exits 0. This resilience is what lets a partially-configured
  adopter still get a useful brief.
- The composer reuses review-ci's `CiReviewResult` type, `DiffInfo`/`resolveDiffRange`
  helpers, and the `PostReview` seam pattern rather than duplicating them.
- Delivery is a single sticky comment upserted by a hidden marker
  (`<!-- harness:pre-merge-brief -->`), not a new comment per push.
- This sets the precedent for how future senior-facing "surface" features compose
  existing harness gears rather than extending them.
