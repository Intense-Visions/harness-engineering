---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: '9f7ba8dda724e742a8feb4b2f7a3c1714cdffe58898ce649e29bedc0fff84e20'
compiledAt: '2026-08-28T01:22:09.342Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['axes.ts', 'derived.test.ts', 'derived.ts']
---

## Summary

`packages/cli/src/shared/craft/findings` defines the 3-axis craft finding model (ADR 0019) — a shared substrate for LLM-judgment outputs across the craft skill family (design-craft, spec-craft, naming-craft, etc.). It exports three type axes (Tier: foundational/polish/aspirational; Impact: small/medium/large; Confidence: high/medium/low) and their derived numeric counterparts. CONFIDENCE_RANK provides the canonical numeric mapping for confidence levels. derivePriority() converts (tier, impact, confidence) tuples into sortable numeric scores using the formula: TIER_BAND[tier] + IMPACT_WEIGHT[impact] \* CONFIDENCE_WEIGHT[confidence]. Tier bands use order-of-magnitude steps (1000/100/10) so tier dominance is mathematically guaranteed — the worst foundational finding always outranks the best aspirational one.

## Invariants

- Tier bands are dominant by design: order-of-magnitude separation (ΔTier_Band ≥ 90) must exceed the maximum within-band score spread (45 = 9 × 5), ensuring tier always determines priority ordering independent of impact or confidence.
- CONFIDENCE_RANK is the single authoritative numeric mapping for the confidence axis; all craft consumers must import and use this table to maintain consistent ordering across the skill family.
- derivePriority is pure and stable: identical (tier, impact, confidence) inputs yield identical output; used for stable sorting, so any formula change breaks downstream sort stability and report reproducibility.
- Axis domains are closed: only the documented three values per axis (tier, impact, confidence) are valid; the exhaustive test suite locks in this contract across all 27 combinations.
- Monotonicity in impact and confidence: when tier and the other variable are held fixed, priority strictly increases — this contracts downstream consumers' expectations for filtered/ranked display.

## Interface Contract

```ts
export CONFIDENCE_RANK
export derivePriority
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from './axes.js'
import { derivePriority } from './derived.js'
import { describe, expect, it } from 'vitest'
```
