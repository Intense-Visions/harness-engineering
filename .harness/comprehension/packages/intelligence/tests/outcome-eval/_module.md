---
schemaVersion: 1
module: 'packages/intelligence/tests/outcome-eval'
sourceHash: '8b9ddd17c11fbcc91a2ecd16b569191f2279ad6be44a43945f66f8d3b76d8b10'
compiledAt: '2026-08-28T01:22:11.938Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'authority.test.ts',
    'canary-signal.test.ts',
    'evaluator.test.ts',
    'guardian-signal.test.ts',
    'persistence.integration.test.ts',
    'prompts.test.ts',
    'schema.test.ts',
    'section-resolver.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisProvider, AnalysisRequest, AnalysisResponse } from '../../src/analysis-provider/interface.js'
import { computePersonaEffectiveness, detectBlindSpots, recommendPersona } from '../../src/effectiveness/scorer.js'
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION, GuardianAnalysis } from '../../src/guardian/index.js'
import { deriveAuthority } from '../../src/outcome-eval/authority.js'
import { OutcomeEvaluator, withCanaryRunSignal, withGuardianSignal } from '../../src/outcome-eval/evaluator.js'
import { LlmVerdict, OUTCOME_EVAL_SYSTEM_PROMPT, PROMPT_FIELD_MAX_CHARS, buildUserPrompt, verdictSchema } from '../../src/outcome-eval/prompts.js'
import { resolveSection } from '../../src/outcome-eval/section-resolver.js'
import { Authority, CanaryRunOutcome, Confidence, JudgedAgainst, OutcomeVerdict, Verdict } from '../../src/outcome-eval/types.js'
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js'
import { GraphStore } from '@harness-engineering/graph'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
```
