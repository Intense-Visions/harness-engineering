---
schemaVersion: 1
module: 'packages/orchestrator/tests/agent/runtime'
sourceHash: 'bb84667baadec4f46ddf63e23ce5adb5288a47a5b96dd7803f644d5ebf9125f6'
compiledAt: '2026-08-28T01:22:12.452Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['docker.behavior.test.ts', 'docker.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DockerRuntime } from '../../../src/agent/runtime/docker'
import { execFile, spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
