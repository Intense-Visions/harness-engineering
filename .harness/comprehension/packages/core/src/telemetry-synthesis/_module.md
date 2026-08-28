---
schemaVersion: 1
module: 'packages/core/src/telemetry-synthesis'
sourceHash: '95c7d053edc03b769ba346dcd0bb2244ac64398b4d8771652d87a2e97c2657bf'
compiledAt: '2026-08-28T01:22:10.634Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'render.ts', 'synthesize.ts']
---

## Interface Contract

```ts
export ComposeSynthesisOptions
export OutcomeNodeLike
export SynthesisInputs
export composeSynthesis
export renderSynthesisMarkdown
```

## Dependency Slice

```
import { aggregateBySkill } from '../adoption/index.js'
import { aggregateByDay } from '../usage/aggregator.js'
import { AdoptionSection, EffectivenessSection, InsightsReport, InsightsSection, OutcomeSection, SkillInvocationRecord, SynthesisSection, TELEMETRY_SYNTHESIS_SECTIONS, TelemetrySynthesis, TelemetrySynthesisSection, UsageRecord, UsageSection } from '@harness-engineering/types'
```
