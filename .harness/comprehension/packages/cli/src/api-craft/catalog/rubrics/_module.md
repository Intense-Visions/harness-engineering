---
schemaVersion: 1
module: 'packages/cli/src/api-craft/catalog/rubrics'
sourceHash: 'b16585f369802e7f17f72cd7a2546b032de7f4bd62eba83e19c5acdcf0eae453'
compiledAt: '2026-08-28T01:22:08.724Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'collections-paginate-and-filter.ts',
    'errors-are-actionable.ts',
    'evolves-without-breaking.ts',
    'index.ts',
    'mutations-are-idempotency-honest.ts',
    'naming-is-predictable.ts',
    'resource-models-the-domain.ts',
    'response-shapes-are-predictable.ts',
    'status-codes-are-correct.ts',
    'types.ts',
    'verbs-are-honest.ts',
  ]
---

## Summary

This module defines a living catalog of API design quality rubrics for `api-craft` — judgment-based checks that complement structural linters. It exports 9 seed rubrics (API-R001 through API-R009) covering domain modeling, naming predictability, HTTP verb honesty, error actionability, idempotency, backwards compatibility, and pagination. Each rubric declares which API-surface kinds it applies to (`*` for universal, or specific kinds like `route`). The key export is `rubricsForKind()`, which filters the catalog by surface kind: most rubrics fire on both OpenAPI specs and route handlers, but idempotency (API-R008) is handler-behavior-only and skips spec surfaces. The module is a structural twin of cli-ergonomics-craft's rubric catalog — same shape, same philosophy. Rubrics capture the "ceiling" (design judgment) above the "floor" (rule-based linting for format/schema compliance).

## Invariants

- rubricsForKind() filtering logic is precise: appliesTo[0] === '\*' OR kind in array — if first element is wildcard, rubric fires on all surfaces; this asymmetry gates idempotency to route-only
- SEED_RUBRICS is immutable (ReadonlyArray), v1 canonical default set — adding/removing rubrics requires design review, not just code edits
- Each rubric's id is stable and externally-visible (API-R001–R009) — code and docs reference these IDs; retitling or reordering breaks downstream consumers
- Idempotency (API-R008) is handler-only (appliesTo: ['route']) — surfaces that cannot reflect runtime idempotency-key logic must skip it
- Rubric metadata fields are load-bearing (version, contribution.addedAt, signal.invocations) — tooling assumes these are present and consistent for suppression/deprecation/adoption tracking
- Judgment-based, not rule-based: Rubrics ask 'does endpoint sit at right abstraction?' — opposite of linters; complements structural validation, not replaces it

## Interface Contract

```ts
export ApiRubric
export ApiSurfaceKind
export SEED_RUBRICS
export rubricsForKind
```

## Dependency Slice

```
import { collectionsPaginateAndFilterRubric } from './collections-paginate-and-filter.js'
import { errorsAreActionableRubric } from './errors-are-actionable.js'
import { evolvesWithoutBreakingRubric } from './evolves-without-breaking.js'
import { mutationsAreIdempotencyHonestRubric } from './mutations-are-idempotency-honest.js'
import { namingIsPredictableRubric } from './naming-is-predictable.js'
import { resourceModelsTheDomainRubric } from './resource-models-the-domain.js'
import { responseShapesArePredictableRubric } from './response-shapes-are-predictable.js'
import { statusCodesAreCorrectRubric } from './status-codes-are-correct.js'
import { ApiRubric, ApiSurfaceKind } from './types.js'
import { verbsAreHonestRubric } from './verbs-are-honest.js'
```
