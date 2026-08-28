---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/catalog/rubrics'
sourceHash: 'e7fe55cc609923a39a45262bffc43a2a4d4c7e4fbc602bbd784858ff0ed9a0ae'
compiledAt: '2026-08-28T01:22:09.198Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'api-doc-predicts-response.ts',
    'examples-earn-their-place.ts',
    'index.ts',
    'order-matches-mental-model.ts',
    'prose-is-alive.ts',
    'scannable-and-navigable.ts',
    'stranger-same-understanding.ts',
    'teaches-not-describes.ts',
    'types.ts',
  ]
---

## Summary

The `docs-craft/catalog/rubrics` module is the quality-gate ceiling for documentation—seven curated rubrics that capture non-automatable questions about whether docs teach rather than enumerate. It's the structural twin of design-craft's rubric catalog (ADR 0020). The seven seed rubrics are sourced from industry benchmarks (Stripe, Linear, MDN, Vercel, Tailwind, Nielsen Norman) and cover: mental-model teaching, progressive disclosure, example rigor, prose voice, API-response predictability, newcomer accessibility, and scannability. Each rubric is keyed by stable id (DOCS-R001…DOCS-R007), versioned, attributed, and tagged with appliesTo scopes (reference/guide/readme/prose or ['*'] for all). The rubricsForKind() function filters rubrics by document classification, so an API-reference rubric fires only on reference docs.

## Invariants

- Closed DocKind union: appliesTo values must be valid DocKind literals or '\*'; adding a new doc kind requires bumping DocsRubric.version and coordinating with callers of rubricsForKind()
- Stable rubric ids: DOCS-R001…DOCS-R007 are the v1 canonical set; each id uniquely identifies a rubric across sessions and must not change
- appliesTo[0] === '\*' is the wildcard: the filter in rubricsForKind() checks only the first element; if it's a wildcard, the rubric applies to all docs
- Every rubric in SEED_RUBRICS must be exported as a named constant: callers expect to import and reference (e.g., teachesNotDescribesRubric) for testing/overrides
- Contribution + signal metadata is load-bearing for lifecycle: addedAt (ISO date), addedBy, and invocations/suppressedAt are part of the audit trail; modifying them breaks traceability
- Source attribution is human-readable and immutable: the source field documents which reference material informed each rubric after contribution

## Interface Contract

```ts
export DocKind
export DocsRubric
export SEED_RUBRICS
export rubricsForKind
```

## Dependency Slice

```
import { apiDocPredictsResponseRubric } from './api-doc-predicts-response.js'
import { examplesEarnTheirPlaceRubric } from './examples-earn-their-place.js'
import { orderMatchesMentalModelRubric } from './order-matches-mental-model.js'
import { proseIsAliveRubric } from './prose-is-alive.js'
import { scannableAndNavigableRubric } from './scannable-and-navigable.js'
import { strangerSameUnderstandingRubric } from './stranger-same-understanding.js'
import { teachesNotDescribesRubric } from './teaches-not-describes.js'
import { DocKind, DocsRubric } from './types.js'
```
