---
number: 0082
title: Page-level exemplar tier before section anchors
date: 2026-08-03
status: accepted
tier: medium
source: harness-iv docs/changes/iv-demo-award-tier-direction/proposal.md (Decision 4)
---

## Context

The design-craft catalog's exemplar corpus was product-UI-component-only
(Button / Modal / EmptyState / LoadingState / ErrorState — CRAFT-B001–B008).
Page-scoped BENCHMARK targets therefore had no ceiling for art direction: a
whole marketing page was scored against component-polish anchors, a bar that
cannot see concept, cross-section composition, or surface/texture/material
craft. Downstream consumers (harness-iv's iv-demo ELEVATE 4B) saw demo pages
score 88–94 while still carrying every template tell the award-tier research
diagnosed (system fonts, boxed uniform grids, near-zero motion, no texture).

## Decision

Grow the marketing tier PAGE-FIRST: one `MarketingPage` componentType with
nine award-documented whole-page exemplars (CRAFT-B009–B017) plus three
page-only rubrics (`appliesTo: ['page']` — concept-coherence C011,
composition-art-direction C012, surface-texture-material C013), BEFORE any
section-level anchors (HeroSection / PageFooter / etc.).

The ordering is the point: concept and cross-section composition are
precisely what component-scoped judgment re-fragments away. Section anchors
would re-introduce that fragmentation at a finer grain; they remain a named
follow-up increment, not part of this tier.

Two verified non-changes are recorded here so future increments do not
re-litigate them:

1. `ComponentType` is deliberately an open string
   (`catalog/exemplars/linear-empty-list.ts`) — no schema bump was needed to
   introduce `MarketingPage`.
2. BENCHMARK's exemplar selection is an exact string-equality match on
   `target.componentType`, and CRITIQUE fans every seed rubric out to every
   target with no `appliesTo` filter — so the tier needed zero code changes:
   documentation, catalog entries, barrel registration, and tests only.

## Consequences

- Page-scoped targets (`componentType: 'MarketingPage'`) converge toward
  award-tier direction: the cited exemplars and the page rubric trio judge
  concept / composition / surface, not component polish alone.
- Risk of page exemplars bleeding into component-scoped runs is nil: the
  equality matcher cites the MarketingPage tier only for MarketingPage
  targets (locked by the end-to-end catalog-seed test).
- Because CRITIQUE applies no `appliesTo` filter, the three page-only
  rubrics (CRAFT-C011..C013) also fire on component-scoped runs — +3 LLM
  calls and +3 findings per target, locked in by critique-mvp.test.ts's
  13-finding assertion — until scope-aware filtering lands.
- ADR 0020 lineage holds: every new entry carries provenance (verified award
  page or published case study), contributors, and versioning; growth
  continues through the contribution lane, and B-codes stay aligned with
  `SEED_EXEMPLARS` index order (append-only).
- Section-level anchors, if later justified, extend the same tier rather
  than replacing it — the page-level bar stays the outer ceiling.
