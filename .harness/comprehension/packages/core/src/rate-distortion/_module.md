---
schemaVersion: 1
module: 'packages/core/src/rate-distortion'
sourceHash: 'd8a252aecf5cd93303b991e0859791e33665e0e91abe4254aa6056a757f65389'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ablation.ts', 'distortion-model.ts', 'index.ts', 'serialize.ts', 'types.ts']
---

## Interface Contract

```ts
export Ablation
export BASELINE
export CellSensitivity
export DEFAULT_MODEL_VERSION
export DEFAULT_SENSITIVITY_THRESHOLD
export DistortionModel
export FitOptions
export INFORMATION_CLASSES
export InformationClass
export ReplayObservation
export ReplayOutcome
export ReplayRun
export ReplayRunner
export Sensitivity
export ablationSuite
export applyAblation
export classifySensitivity
export fitDistortionModel
export runAblationSuite
export serializeDistortionModel
```

## Dependency Slice

```
import { CellSensitivity, DistortionModel, Sensitivity } from './distortion-model'
import { Ablation, BASELINE, INFORMATION_CLASSES, InformationClass, ReplayObservation, ReplayRun, ReplayRunner } from './types'
```
