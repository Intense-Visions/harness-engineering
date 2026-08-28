---
schemaVersion: 1
module: 'packages/intelligence/tests/acceptance-eval'
sourceHash: '2d8e7b5c27000881f8698f3dbbbc6da6739e637b4e09ad288e90e48dc3d0b423'
compiledAt: '2026-08-28T01:22:11.882Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['authority.test.ts', 'evaluator.test.ts', 'exports.test.ts', 'prompts.test.ts', 'schema.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { deriveAcceptanceAuthority } from '../../src/acceptance-eval/authority.js'
import { AcceptanceEvaluator } from '../../src/acceptance-eval/evaluator.js'
import { ACCEPTANCE_EVAL_SYSTEM_PROMPT, LlmAcceptanceVerdict, PROMPT_FIELD_MAX_CHARS, acceptanceVerdictSchema, buildUserPrompt } from '../../src/acceptance-eval/prompts.js'
import { Authority, Confidence, Measurability } from '../../src/acceptance-eval/types.js'
import { AnalysisProvider, AnalysisRequest, AnalysisResponse } from '../../src/analysis-provider/interface.js'
import { ACCEPTANCE_EVAL_SYSTEM_PROMPT, AcceptanceEvaluator, AcceptanceVerdict, acceptanceVerdictSchema, buildAcceptanceUserPrompt, deriveAcceptanceAuthority } from '../../src/index.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
```
