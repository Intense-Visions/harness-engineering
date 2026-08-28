---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/catalog/rubrics'
sourceHash: '251cb77eefcc843fa95525351e10891dda2733170c85acf2d2f05f6e3084e281'
compiledAt: '2026-08-28T01:22:09.296Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'concreteness.ts',
    'convention-conformance.ts',
    'encoded-measure.ts',
    'index.ts',
    'predictive-power.ts',
    'scope-match.ts',
    'types.ts',
    'verb-noun-honesty.ts',
  ]
---

## Summary

The `naming-craft/catalog/rubrics` module exports a living catalog of 6 seed naming rubrics — codified principles for evaluating identifier quality across variables, functions, types, and files. Each rubric pairs a concrete naming heuristic (e.g., "encode units," "match scope to name length") with authoritative citations (Martin, Beck, Karlton). The module exports `NamingRubric` type and `SEED_RUBRICS` read-only array, with each rubric defined in its own file and bundled in `index.ts`. The catalog is designed for extensibility via ADR 0020's proposal→review→version mechanism, but v1 ships sealed with these 6 seeds, ordered by evaluation priority so cost-capped runs see highest-ROI checks first.

## Invariants

- Rubric ordering in SEED_RUBRICS is load-bearing — cost-capped runs stop after N rubrics, so high-ROI checks (predictive power, concreteness) go first
- NamingRubric shape is the interface contract — all rubrics must have id, title, description, source, appliesTo, contribution, signal, version
- appliesTo is a finite enum: only 'variable' | 'function' | 'type' | 'file' are valid; LLM prompts depend on this constraint
- All v1 seed rubrics were seeded on 2026-05-24 by 'seed' — drift from this baseline signals external contribution that bypassed the proposal gate
- id field is stable for lookups — current seeds use NAME-R001 through NAME-R006; callers may reference rubrics by ID and expect immutability
- SEED_RUBRICS is ReadonlyArray — immutability prevents accidental mutation; extension must go through v1.x proposal mechanism, not field edits
- signal metadata (invocations, suppressedAt) is reserved for v1.x — must be present on every rubric to maintain schema uniformity, inert in v1
- All seeds share version: 1 — versioning is reserved for breaking shape/semantics changes; seed-only additions stay on v1
- source field is authoritative — every rubric cites a named author/publication; citations are required before proposal approval
- Extensibility is gated by ADR 0020 — new rubrics require spec+review, not ad-hoc additions to the array

## Interface Contract

```ts
export NamingRubric
export SEED_RUBRICS
```

## Dependency Slice

```
import { concretenessRubric } from './concreteness.js'
import { conventionConformanceRubric } from './convention-conformance.js'
import { encodedMeasureRubric } from './encoded-measure.js'
import { predictivePowerRubric } from './predictive-power.js'
import { scopeMatchRubric } from './scope-match.js'
import { NamingRubric } from './types.js'
import { verbNounHonestyRubric } from './verb-noun-honesty.js'
```
