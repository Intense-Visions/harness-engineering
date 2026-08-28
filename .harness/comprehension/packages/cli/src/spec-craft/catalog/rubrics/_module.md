---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/catalog/rubrics'
sourceHash: '188d74e00cd567bececfe48a52670217331703ca0eb7a610fc1f0a71c5555ac5'
compiledAt: '2026-08-28T01:22:09.411Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'honest-rationalizations.ts',
    'index.ts',
    'joints.ts',
    'load-bearing.ts',
    'non-goals-honesty.ts',
    'sharpness.ts',
    'stranger-in-6-months.ts',
    'two-readers.ts',
    'types.ts',
  ]
---

## Summary

The `spec-craft/catalog/rubrics` module exports a curated, living catalog of 7 seed quality rubrics for technical specification critique. Each rubric (SPEC-R001 through SPEC-R007) pairs a clarity/completeness criterion with its authoritative source (Plato, Strunk+White, Spolsky, etc.), then targets specific spec sections via exact string match or regex. The rubrics enforce: sharpness over vagueness, decomposition at natural problem boundaries, unambiguous meaning, signal-rich decisions, honest counterargument handling, real (not smuggled) deferrals, and time-capsule durability. Designed as a living catalog (ADR 0020), the seed set is immutable and intentionally ordered by signal density so cost-capped runs prioritize high-value findings. Growth is additive and versioned; each rubric carries metadata for adoption tracking and future muting logic.

## Invariants

- Section matcher evaluation is disjunctive: rubricApplies() returns true if ANY matcher fires (wildcard '\*', exact string, or regex test); a spec section is critiqued by all matching rubrics
- Ordering is load-bearing: SEED_RUBRICS array order is intentional; earlier rubrics run first in critique loops so cost-capped runs surface high-value findings
- Seed set is immutable, growth is additive: each rubric pins version:1 with contribution metadata; new rubrics land at v1.x via growth mechanism (ADR 0020); SEED_RUBRICS is ReadonlyArray
- Every rubric must cite authoritative source: source field is canonical, not filler; rubrics are anchored to spec-quality canon, not arbitrary opinion
- Section-to-rubric mapping is canonical: sourced from docs/changes/craft-pipeline/spec-craft/proposal.md; changes to appliesToSections must update the design doc (SSOT)
- Signal tracking gates future enhancements: each rubric carries signal: { invocations, suppressedAt } metadata for v1.x adoption metrics and user-muting logic

## Interface Contract

```ts
export SEED_RUBRICS
export SectionMatcher
export SpecRubric
export rubricApplies
```

## Dependency Slice

```
import { honestRationalizationsRubric } from './honest-rationalizations.js'
import { jointsRubric } from './joints.js'
import { loadBearingRubric } from './load-bearing.js'
import { nonGoalsHonestyRubric } from './non-goals-honesty.js'
import { sharpnessRubric } from './sharpness.js'
import { strangerInSixMonthsRubric } from './stranger-in-6-months.js'
import { twoReadersRubric } from './two-readers.js'
import { SpecRubric } from './types.js'
```
