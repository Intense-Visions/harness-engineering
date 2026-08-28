---
schemaVersion: 1
module: 'packages/cli/src/api-craft/catalog/rubrics'
sourceHash: 'b16585f369802e7f17f72cd7a2546b032de7f4bd62eba83e19c5acdcf0eae453'
compiledAt: '2026-08-28T01:22:08.724Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
