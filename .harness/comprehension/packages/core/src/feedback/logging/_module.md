---
schemaVersion: 1
module: 'packages/core/src/feedback/logging'
sourceHash: 'ae80c270a75a7e686254b80c07847f56d1f2a1beedfe95b3193986e1ccd779d2'
compiledAt: '2026-08-28T01:22:10.384Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['console-sink.ts', 'emitter.ts', 'file-sink.ts', 'sink.ts']
---

## Interface Contract

```ts
export AgentActionEmitter
export ConsoleSink
export FileSink
export NoOpSink
export getActionEmitter
export logAgentAction
export trackAction
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { generateId } from '../../shared/uuid'
import { getFeedbackConfig } from '../config'
import { ActionContext, ActionEvent, ActionEventHandler, ActionEventType, ActionResult, ActionSink, ActionTracker, ActionType, AgentAction, FeedbackError } from '../types'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
```
