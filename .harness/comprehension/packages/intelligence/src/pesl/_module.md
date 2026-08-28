---
schemaVersion: 1
module: 'packages/intelligence/src/pesl'
sourceHash: 'dc997e9f429f6367c4e98002f2a1bcb8ec4dc76b40a0d55d29e99447ec0f1cca'
compiledAt: '2026-08-28T01:22:11.851Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['graph-checks.ts', 'llm-simulation.ts', 'prompts.ts', 'simulator.ts']
---

## Interface Contract

```ts
export PESL_SYSTEM_PROMPT
export PeslSimulator
export buildPeslPrompt
export peslResponseSchema
export runGraphOnlyChecks
export runLlmSimulation
```

## Dependency Slice

```
import { AnalysisProvider } from '../analysis-provider/interface.js'
import { ComplexityScore, EnrichedSpec, SimulationResult } from '../types.js'
import { runGraphOnlyChecks } from './graph-checks.js'
import { runLlmSimulation } from './llm-simulation.js'
import { PESLResponse, PESL_SYSTEM_PROMPT, buildPeslPrompt, peslResponseSchema } from './prompts.js'
import { CascadeSimulator, GraphStore, groupNodesByImpact } from '@harness-engineering/graph'
import { ScopeTier } from '@harness-engineering/types'
import { z } from 'zod'
```
