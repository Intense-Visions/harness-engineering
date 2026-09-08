---
schemaVersion: 1
module: 'packages/core/src/deployment'
sourceHash: '8537704703656ffc59500b709b36966dfc55992bbb215286cb555d1e6d3a6736'
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
