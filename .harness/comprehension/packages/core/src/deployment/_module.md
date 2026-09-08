---
schemaVersion: 1
module: 'packages/core/src/deployment'
sourceHash: '470b0caaf7825f630d96819be88cce009ec0f0de7245511bcce2ba6d90f4042e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['detect.ts', 'evaluate.ts', 'exit-code.ts', 'index.ts', 'types.ts']
---

## Interface Contract

```ts
export DeploymentExitCode
export DeploymentFile
export DeploymentFinding
export DeploymentFsPort
export DeploymentGateConfig
export DeploymentGateResult
export DeploymentSeverity
export DeploymentSurface
export deriveDeploymentExitCode
export detectDeploymentSurface
export evaluateDeploymentGate
```

## Dependency Slice

```
import { SecurityScanner } from '../security'
import { DeploymentExitCode, DeploymentFile, DeploymentFinding, DeploymentFsPort, DeploymentGateConfig, DeploymentGateResult, DeploymentSeverity, DeploymentSurface } from './types'
import { parseYaml } from 'yaml'
```
