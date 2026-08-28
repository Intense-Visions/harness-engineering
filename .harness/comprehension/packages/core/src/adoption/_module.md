---
schemaVersion: 1
module: 'packages/core/src/adoption'
sourceHash: '99b4a66a61023349d5a8666ed7ca46c75ac3f64a2d92e8a8ef96f56b5b764187'
compiledAt: '2026-08-28T01:22:10.265Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['aggregator.ts', 'index.ts', 'reader.ts', 'retrospective.ts']
---

## Interface Contract

```ts
export DailyAdoption
export RetrospectiveCoverage
export RetrospectiveOptions
export RetrospectiveReport
export SkillRetroStat
export aggregateByDay
export aggregateBySkill
export getCatalogRetrospectiveReport
export isAbandonedMidWorkflow
export readAdoptionRecords
export renderRetrospectiveMarkdown
export topSkills
```

## Dependency Slice

```
import { FAILURE_CATEGORIES, SkillAdoptionSummary, SkillInvocationRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
