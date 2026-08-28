---
schemaVersion: 1
module: 'packages/orchestrator/src/agent/runtime'
sourceHash: '49dec9e77339186e246e0da9a8f05914daae257d95484b89f4b43ff3169fcf65'
compiledAt: '2026-08-28T01:22:12.093Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['docker.ts', 'index.ts']
---

## Interface Contract

```ts
export DockerRuntime
```

## Dependency Slice

```
import { ContainerCreateOpts, ContainerError, ContainerExecOpts, ContainerHandle, ContainerRuntime, Err, Ok, Result } from '@harness-engineering/types'
import { execFile, spawn } from 'node:child_process'
import from 'node:readline'
```
