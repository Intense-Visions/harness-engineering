---
schemaVersion: 1
module: 'packages/core/tests/rate-distortion'
sourceHash: 'bcf1d25a5031dff89a92eeeaf0239967b971e93b072bfac5820f587bce07a824'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ablation.test.ts', 'distortion-model.test.ts', 'serialize.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ablationSuite, applyAblation, runAblationSuite } from '../../src/rate-distortion/ablation'
import { DEFAULT_MODEL_VERSION, classifySensitivity, fitDistortionModel } from '../../src/rate-distortion/distortion-model'
import { serializeDistortionModel } from '../../src/rate-distortion/serialize'
import { Ablation, BASELINE, INFORMATION_CLASSES, InformationClass, ReplayObservation, ReplayOutcome, ReplayRun } from '../../src/rate-distortion/types'
import { describe, expect, it } from 'vitest'
```
