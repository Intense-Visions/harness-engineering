---
schemaVersion: 1
module: 'packages/intelligence/src/acceptance-eval'
sourceHash: 'b11e7c5e31b254385e496f140622958d745494ae0ed672036ee4a602d55c668e'
compiledAt: '2026-08-28T01:22:11.827Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['authority.ts', 'evaluator.ts', 'index.ts', 'prompts.ts', 'types.ts']
---

## Interface Contract

```ts
export ACCEPTANCE_EVAL_SYSTEM_PROMPT
export AcceptanceEvalInput
export AcceptanceEvaluator
export AcceptanceEvaluatorOptions
export AcceptanceVerdict
export Authority
export Confidence
export Finding
export JudgedAgainst
export LlmAcceptanceVerdict
export Measurability
export acceptanceVerdictSchema
export buildUserPrompt
export deriveAcceptanceAuthority
export findingSchema
```

## Dependency Slice

```
import { AnalysisProvider } from '../analysis-provider/interface.js'
import { resolveSection } from '../outcome-eval/section-resolver.js'
import { Authority, Confidence, JudgedAgainst } from '../outcome-eval/types.js'
import { deriveAcceptanceAuthority } from './authority.js'
import { ACCEPTANCE_EVAL_SYSTEM_PROMPT, LlmAcceptanceVerdict, acceptanceVerdictSchema, buildUserPrompt } from './prompts.js'
import { AcceptanceEvalInput, AcceptanceVerdict, Authority, Confidence, JudgedAgainst, Measurability } from './types.js'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
```
