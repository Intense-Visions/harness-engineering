---
schemaVersion: 1
module: 'packages/core/tests/feedback/logging'
sourceHash: 'c42b4d38df71417964d4bce70fe9aba35584941e13fa038a890e15b3875e21d5'
compiledAt: '2026-08-28T01:22:10.850Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['console-sink.test.ts', 'emitter.test.ts', 'file-sink.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { configureFeedback, resetFeedbackConfig } from '../../../src/feedback/config'
import { ConsoleSink } from '../../../src/feedback/logging/console-sink'
import { AgentActionEmitter, getActionEmitter, logAgentAction, trackAction } from '../../../src/feedback/logging/emitter'
import { FileSink } from '../../../src/feedback/logging/file-sink'
import { NoOpSink } from '../../../src/feedback/logging/sink'
import { AgentAction } from '../../../src/feedback/types'
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
