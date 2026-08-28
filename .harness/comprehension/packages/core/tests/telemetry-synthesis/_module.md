---
schemaVersion: 1
module: 'packages/core/tests/telemetry-synthesis'
sourceHash: 'aec26ea9181bd8282e0efe5b1b52890bb44ce96846b714e6085edf1c11ac9df6'
compiledAt: '2026-08-28T01:22:11.109Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['synthesize.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { OutcomeNodeLike, SynthesisInputs, composeSynthesis, renderSynthesisMarkdown } from '../../src/telemetry-synthesis/index.js'
import { EffectivenessSection, InsightsReport, SkillInvocationRecord, UsageRecord } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
