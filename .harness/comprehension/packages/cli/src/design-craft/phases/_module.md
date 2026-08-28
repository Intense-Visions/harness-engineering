---
schemaVersion: 1
module: 'packages/cli/src/design-craft/phases'
sourceHash: '73ba2a6cb25061a6c514147ec6c46acd16306070a63d24e0b1d006e4e3cdf991'
compiledAt: '2026-08-28T01:22:09.123Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['award-bar.ts', 'benchmark.ts', 'critique.ts', 'polish.ts']
---

## Interface Contract

```ts
export DEFAULT_AWARD_BAR_CONFIG
export applyResponsiveGate
export computeAwardBar
export parseBenchmarkResponse
export parseFindingResponse
export parsePolishResponse
export patternIsPlausible
export resolveAwardBarConfig
export runBenchmark
export runCritique
export runPolish
export runVisionBenchmark
export runVisionCritique
```

## Dependency Slice

```
import { ResponsiveGateConfig, ResponsiveGateResult, ResponsiveMetrics, computeResponsiveGate } from '../../responsive/index.js'
import { CONFIDENCE_RANK } from '../../shared/craft/findings/axes.js'
import { ExemplarDefinition } from '../catalog/exemplars/linear-empty-list.js'
import { PatternDefinition } from '../catalog/patterns/spring-physics.js'
import { RubricDefinition } from '../catalog/rubrics/hierarchy-clarity.js'
import { derivePriority } from '../findings/derived.js'
import { AwardBar, AwardBarDimension, AwardVerdict, BenchmarkScore, Confidence, CraftFinding, Impact, RadarDimension, RadarDimensionName, Tier } from '../findings/schema.js'
import { LlmProvider } from '../llm/provider.js'
import { AwardBarConfig, applyResponsiveGate, computeAwardBar } from './award-bar.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
