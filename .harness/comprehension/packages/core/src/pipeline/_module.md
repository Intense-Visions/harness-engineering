---
schemaVersion: 1
module: 'packages/core/src/pipeline'
sourceHash: '17fc4beb9a43df642042719f7c3282b76f9bd763d2cd43a0387898abaa27959f'
compiledAt: '2026-08-28T01:22:10.435Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'skill-pipeline.ts']
---

## Interface Contract

```ts
export PipelineOptions
export PipelineResult
export SkillExecutor
export TurnExecutor
export runMultiTurnPipeline
export runPipeline
```

## Dependency Slice

```
import { SkillContext, SkillLifecycleHooks, SkillResult, TurnContext } from '@harness-engineering/types'
```
