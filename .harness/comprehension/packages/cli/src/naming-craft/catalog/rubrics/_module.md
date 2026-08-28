---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/catalog/rubrics'
sourceHash: '251cb77eefcc843fa95525351e10891dda2733170c85acf2d2f05f6e3084e281'
compiledAt: '2026-08-28T01:22:09.296Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
