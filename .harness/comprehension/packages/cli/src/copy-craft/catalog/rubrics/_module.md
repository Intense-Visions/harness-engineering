---
schemaVersion: 1
module: 'packages/cli/src/copy-craft/catalog/rubrics'
sourceHash: '85f665c587cb9b5e18b83f6f632d6f5f43f0fc27dd96ee8aa8afaf74e1bec8bc'
compiledAt: '2026-08-28T01:22:08.993Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'calm-not-panicky.ts',
    'describes-change-not-work.ts',
    'grep-survives.ts',
    'index.ts',
    'signal-not-noise.ts',
    'specific-not-generic.ts',
    'stranger-in-6-months.ts',
    'types.ts',
    'what-why-how-to-fix.ts',
    'why-not-what.ts',
  ]
---

## Interface Contract

```ts
export CopyRubric
export SEED_RUBRICS
export rubricApplies
```

## Dependency Slice

```
import { CopySurface } from '../../findings/schema.js'
import { calmNotPanickyRubric } from './calm-not-panicky.js'
import { describesChangeNotWorkRubric } from './describes-change-not-work.js'
import { grepSurvivesRubric } from './grep-survives.js'
import { signalNotNoiseRubric } from './signal-not-noise.js'
import { specificNotGenericRubric } from './specific-not-generic.js'
import { strangerInSixMonthsRubric } from './stranger-in-6-months.js'
import { CopyRubric } from './types.js'
import { whatWhyHowToFixRubric } from './what-why-how-to-fix.js'
import { whyNotWhatRubric } from './why-not-what.js'
```
