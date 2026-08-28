---
schemaVersion: 1
module: 'packages/core/src/validation/agent-configs'
sourceHash: '9636a2113e2f4002564a0815ce46dac476f2c73f301dd64cdf2fc14ae4601c65'
compiledAt: '2026-08-28T01:22:10.674Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['agnix-runner.ts', 'index.ts', 'runner.ts', 'types.ts']
---

## Interface Contract

```ts
export AgentConfigFallbackReason
export AgentConfigFinding
export AgentConfigOptions
export AgentConfigSeverity
export AgentConfigValidation
export runFallbackRules
export validateAgentConfigs
```

## Dependency Slice

```
import { DEFAULT_AGNIX_TIMEOUT_MS, isAgnixDisabled, parseAgnixOutput, resolveAgnixBinary, runAgnix } from './agnix-runner'
import { runFallbackRules } from './fallback'
import { AgentConfigFallbackReason, AgentConfigFinding, AgentConfigOptions, AgentConfigSeverity, AgentConfigValidation } from './types'
import { SpawnOptions, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
```
