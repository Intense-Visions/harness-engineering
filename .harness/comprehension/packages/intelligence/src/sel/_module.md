---
schemaVersion: 1
module: 'packages/intelligence/src/sel'
sourceHash: '4cdf68bbce7a05e59baef3ca13f357b41ce7b003eca25d6e1c486eaddd20a6fe'
compiledAt: '2026-08-28T01:22:11.855Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['enricher.ts', 'graph-validator.ts', 'prompts.ts']
---

## Interface Contract

```ts
export GraphValidator
export SEL_SYSTEM_PROMPT
export buildUserPrompt
export enrich
export selResponseSchema
```

## Dependency Slice

```
import { AnalysisProvider } from '../analysis-provider/interface.js'
import { AffectedSystem, EnrichedSpec, RawWorkItem } from '../types.js'
import { GraphValidator } from './graph-validator.js'
import { SELResponse, SEL_SYSTEM_PROMPT, buildUserPrompt, selResponseSchema } from './prompts.js'
import { CascadeSimulator, GraphStore } from '@harness-engineering/graph'
import { z } from 'zod'
```
