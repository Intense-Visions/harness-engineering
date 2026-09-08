---
schemaVersion: 1
module: 'packages/core/src/deployment'
sourceHash: 'bdee8f9afa4d8375d5c783f28b319ba03da015646fb72073409efc8f70725e1c'
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
