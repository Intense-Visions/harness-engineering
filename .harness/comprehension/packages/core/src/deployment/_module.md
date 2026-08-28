---
schemaVersion: 1
module: 'packages/core/src/deployment'
sourceHash: '3a9f2ae98ff2ddeb2e2016bc42cf38dc18ed4e811ae95bf97cb695ae5238e0f0'
compiledAt: '2026-08-28T01:22:10.331Z'
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
