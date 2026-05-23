# BENCHMARK Specimen: MyEmptyState vs Linear Empty List

> Paper BenchmarkScore authored against the 5-dim radar schema
> (spec lines 149–162).
> Sprint 0 deliverable: one worked benchmark output specimen.
>
> Scenario: a hypothetical `MyEmptyState` component lives in a
> hypothetical product. The BENCHMARK phase compares it against
> `exemplar-linear-empty-list` (one of the three Phase 0 exemplars).
> All scores, narrative, and gaps are fabricated for schema-fit
> validation — not derived from a real LLM call.

```yaml
runId: bench-2026-05-23-001
target:
  file: src/components/EmptyState/EmptyState.tsx
  component: MyEmptyState
exemplars:
  - exemplar-linear-empty-list
radar:
  philosophicalCoherence:
    score: 65
    confidence: high
    notes: |
      Component mostly aligns with the rest of the product's quiet
      aesthetic, but the inclusion of a secondary "Learn more" link
      below the primary CTA creates a competing focal point. Linear
      uses a single CTA precisely to avoid this. Deduct 25 points
      for the secondary-link drift.
  hierarchy:
    score: 70
    confidence: high
    notes: |
      Heading reads first, body second, CTA third — the order is
      correct. However, the heading and body share the same color
      and weight, only differing in size (24px vs 16px). This
      muddies the heading/body distinction. The exemplar uses a
      weight + color shift in addition to size, producing a sharper
      tier separation.
  craftExecution:
    score: 55
    confidence: medium
    notes: |
      Body copy is slightly too long (3 sentences vs the exemplar's
      1 sentence). Illustration is a raster PNG with visible
      anti-aliasing on its edges (exemplar uses crisp vector line
      art). Whitespace around the focal cluster is uneven — extra
      space on top, tight space below. Code-only analysis limits
      confidence on the raster-vs-vector judgment.
  function:
    score: 80
    confidence: high
    notes: |
      Component does its job: communicates emptiness and provides a
      clear next action. Functionally sound. Loses points only for
      the secondary-link distraction noted under philosophical
      coherence.
  innovation:
    score: 50
    confidence: medium
    notes: |
      Standard 4-part anatomy with no novel moves. This is not
      necessarily a flaw — empty states do not benefit from novelty
      for novelty's sake — but the target shows no signature touch
      that would distinguish it from any reference implementation.
overall:
  score: 64
  confidence: medium
gaps:
  - |
    Remove the secondary "Learn more" link OR demote it to a
    tertiary visual register (smaller, dimmer, set below the focal
    cluster with extra whitespace separation). Restoring single-CTA
    focus closes the largest gap against the exemplar.
  - |
    Differentiate heading from body via weight + color, not just
    size. A 600-weight heading in a saturated text color over a
    400-weight body in a muted text color would resolve the
    hierarchy muddy-ness.
  - |
    Replace the raster illustration with a crisp vector line drawing
    matching the brand's existing illustration register. If no
    register exists, propose a brand-level direction in
    harness-design INTENT phase before continuing.
  - |
    Tighten body copy from 3 sentences to 1. The exemplar's
    "single-sentence guidance" rule is a craft elevator worth
    adopting product-wide for empty states.
  - |
    Optional (low impact): even out the whitespace around the focal
    cluster so the focal point sits visually centered, not biased
    toward the top.
```

## Notes for schema-fit review

- `runId` field appears in the spec under
  `DesignCraftOutput.summary.runId` (spec line 175) but is logically
  attached to a single `BenchmarkScore` for cross-iteration fixpoint
  detection (per success criterion #34). Flag whether `runId` should
  also be a first-class field on `BenchmarkScore` or only on the
  output summary.
- `exemplars: [exemplar-linear-empty-list]` — the schema's
  `exemplars` field is an array but this specimen only references
  one. Future BENCHMARK calls may reference multiple exemplars per
  component-type for a more robust comparison. Schema must allow
  N≥1 exemplar ids.
- `overall.score: 64` is a non-weighted simple mean of the five
  radar scores (65+70+55+80+50)/5 = 64. The spec says "weighted
  aggregate" (line 159) but does not specify weights. Flag for
  schema-fit review and for Phase 1 implementation: weights must be
  declared and stable across runs (otherwise fixpoint detection
  breaks).
- `overall.confidence: medium` derives from the mix of high/medium
  per-dimension confidences. The aggregation rule (min? mean?
  weighted?) is not defined in spec. Flag for review.
- `gaps` is an ordered list of narrative items. The schema only
  requires `string[]`. Flag whether each gap should be a structured
  `{ summary, impact, recommendedPattern? }` to enable downstream
  routing to POLISH suggestions.
