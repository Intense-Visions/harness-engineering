---
schemaVersion: 1
module: 'packages/cli/src/code-craft/catalog/rubrics'
sourceHash: '1c952658958e3e8b0d487e28c60d76e744b85e965cd4ea730a7bc142b5cdfd9a'
compiledAt: '2026-08-28T01:22:08.770Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'abstraction-earns-keep.ts',
    'control-flow-honest.ts',
    'index.ts',
    'one-story-one-altitude.ts',
    'reveals-intent.ts',
    'senior-nods-not-winces.ts',
    'signature-keeps-promise.ts',
    'simplest-it-could-be.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export CodeRubric
export SEED_RUBRICS
export UnitKind
export rubricApplies
```

## Dependency Slice

```
import { UnitKind } from '../../findings/schema.js'
import { abstractionEarnsKeepRubric } from './abstraction-earns-keep.js'
import { controlFlowHonestRubric } from './control-flow-honest.js'
import { oneStoryOneAltitudeRubric } from './one-story-one-altitude.js'
import { revealsIntentRubric } from './reveals-intent.js'
import { seniorNodsNotWincesRubric } from './senior-nods-not-winces.js'
import { signatureKeepsPromiseRubric } from './signature-keeps-promise.js'
import { simplestItCouldBeRubric } from './simplest-it-could-be.js'
import { CodeRubric } from './types.js'
```
