---
schemaVersion: 1
module: 'packages/core/tests/pipeline'
sourceHash: '9689fda374e397068f77d882e0705f6ac8b1d7423ac8d2895efd0f86582d48b5'
compiledAt: '2026-08-28T01:22:10.880Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['skill-pipeline.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runMultiTurnPipeline, runPipeline } from '../../src/pipeline/skill-pipeline'
import { SkillContext, SkillLifecycleHooks, SkillResult } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
