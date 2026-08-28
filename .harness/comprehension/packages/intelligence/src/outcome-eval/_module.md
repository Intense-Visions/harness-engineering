---
schemaVersion: 1
module: 'packages/intelligence/src/outcome-eval'
sourceHash: '97a77eb11083b75d97adfbdf3f02ce460ea766a874996e68aadaa1356009ddde'
compiledAt: '2026-08-28T01:22:11.850Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['authority.ts', 'evaluator.ts', 'index.ts', 'prompts.ts', 'section-resolver.ts', 'types.ts']
---

## Interface Contract

```ts
export Authority
export CanaryRunOutcome
export Confidence
export JudgedAgainst
export LlmVerdict
export OUTCOME_EVAL_SYSTEM_PROMPT
export OutcomeEvalInput
export OutcomeEvaluator
export OutcomeEvaluatorOptions
export OutcomeVerdict
export ResolvedSection
export Verdict
export buildUserPrompt
export deriveAuthority
export resolveSection
export verdictSchema
```

## Dependency Slice

```
import { AnalysisProvider } from '../analysis-provider/interface.js'
import { summarizeGuardian } from '../guardian/summary.js'
import { GuardianAnalysis } from '../guardian/types.js'
import { ExecutionOutcomeConnector } from '../outcome/connector.js'
import { ExecutionOutcome } from '../outcome/types.js'
import { deriveAuthority } from './authority.js'
import { LlmVerdict, OUTCOME_EVAL_SYSTEM_PROMPT, buildUserPrompt, verdictSchema } from './prompts.js'
import { resolveSection } from './section-resolver.js'
import { Authority, CanaryRunOutcome, Confidence, JudgedAgainst, OutcomeEvalInput, OutcomeVerdict, Verdict } from './types.js'
import { GraphStore } from '@harness-engineering/graph'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
```
