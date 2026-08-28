---
schemaVersion: 1
module: 'packages/orchestrator/tests'
sourceHash: '262af753be43c9ab72b042680165c8082c9c4cfddf7e7183f2bb76d91fe45ab1'
compiledAt: '2026-08-28T01:22:12.435Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['orchestrator-pr-guard.test.ts', 'setup.ts', 'verify-changed-packages.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { PRDetector } from '../src/core/pr-detector'
import { Orchestrator } from '../src/orchestrator'
import { verifyChangedPackages } from '../src/orchestrator.js'
import { Issue, Ok, WorkflowConfig } from '@harness-engineering/types'
import { execFile } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
