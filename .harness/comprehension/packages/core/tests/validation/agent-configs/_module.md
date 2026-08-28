---
schemaVersion: 1
module: 'packages/core/tests/validation/agent-configs'
sourceHash: 'd84f6d9e04a309bb91b16bab3760fc3a29b4d89ed6806af7029335ac86525fe7'
compiledAt: '2026-08-28T01:22:11.155Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agnix-runner.behavior.test.ts',
    'agnix-runner.test.ts',
    'fallback.test.ts',
    'runner.behavior.test.ts',
    'runner.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { validateAgentConfigs } from '../../../src/validation/agent-configs'
import { AgnixOutcome, DEFAULT_AGNIX_TIMEOUT_MS, HARNESS_AGNIX_BIN, HARNESS_AGNIX_DISABLE, isAgnixDisabled, parseAgnixOutput, resolveAgnixBinary, runAgnix } from '../../../src/validation/agent-configs/agnix-runner'
import { runFallbackRules } from '../../../src/validation/agent-configs/fallback'
import { validateAgentConfigs } from '../../../src/validation/agent-configs/runner'
import { AgentConfigFinding, AgentConfigValidation } from '../../../src/validation/agent-configs/types'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
