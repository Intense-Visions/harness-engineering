---
schemaVersion: 1
module: 'packages/core/tests/deployment'
sourceHash: '2a91fc804036a2f5cb1264258802ddd5c7390733eb8564f8e79a48b7af4e417b'
compiledAt: '2026-08-28T01:22:10.797Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['detect.test.ts', 'evaluate.test.ts', 'exit-code.test.ts', 'fixtures.ts']
---

## Interface Contract

```ts
export memFs
export surface
```

## Dependency Slice

```
import { detectDeploymentSurface } from '../../src/deployment/detect'
import { evaluateDeploymentGate } from '../../src/deployment/evaluate'
import { deriveExitCode } from '../../src/deployment/exit-code'
import { DeploymentFsPort, DeploymentGateResult, DeploymentSurface } from '../../src/deployment/types'
import { memFs, surface } from './fixtures'
import { describe, expect, it } from 'vitest'
```
