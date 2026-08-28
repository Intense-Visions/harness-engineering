---
schemaVersion: 1
module: 'packages/core/src/feedback/executor'
sourceHash: 'f458e4521d7d523c3823a84b784171389082c8ec07de92ebe7032e6a18ce067e'
compiledAt: '2026-08-28T01:22:10.372Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['noop.ts']
---

## Interface Contract

```ts
export NoOpExecutor
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { generateId } from '../../shared/uuid'
import { AgentExecutor, AgentProcess, ExecutorHealth, FeedbackAgentConfig, FeedbackError, PeerReview } from '../types'
```
