---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/catalog/rubrics'
sourceHash: '188d74e00cd567bececfe48a52670217331703ca0eb7a610fc1f0a71c5555ac5'
compiledAt: '2026-08-28T01:22:09.411Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
