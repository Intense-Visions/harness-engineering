---
schemaVersion: 1
module: 'packages/core/src/solutions'
sourceHash: 'd43bd52369df56bf764ea7d8afaafde9d8b3f3a37816f64aba1e4204d6fe75f8'
compiledAt: '2026-08-28T01:22:10.603Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'schema.test.ts', 'schema.ts']
---

## Interface Contract

```ts
export *
export ALL_SOLUTION_CATEGORIES
export BUG_TRACK_CATEGORIES
export BugTrackCategory
export KNOWLEDGE_TRACK_CATEGORIES
export KnowledgeTrackCategory
export SolutionCategory
export SolutionDocFrontmatter
export SolutionDocFrontmatterSchema
export SolutionTrack
```

## Dependency Slice

```
import { BUG_TRACK_CATEGORIES, KNOWLEDGE_TRACK_CATEGORIES, SolutionDocFrontmatterSchema } from './schema'
import { SolutionDocFrontmatter } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
```
