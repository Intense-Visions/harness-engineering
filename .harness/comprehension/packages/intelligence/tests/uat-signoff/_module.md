---
schemaVersion: 1
module: 'packages/intelligence/tests/uat-signoff'
sourceHash: '03ab4083a6aeb543915c3c37f34a8bac3fe6e8f5244db975cac4163f5bca9fc2'
compiledAt: '2026-08-28T01:22:11.922Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['recorder.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { computePersonaEffectiveness } from '../../src/effectiveness/scorer.js'
import { UAT_SIGNOFF_SOURCE, UatSignoffInput, UatSignoffRecorder, toUatExecutionOutcome } from '../../src/uat-signoff/index.js'
import { GraphStore } from '@harness-engineering/graph'
import { describe, expect, it } from 'vitest'
```
