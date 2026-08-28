---
schemaVersion: 1
module: 'packages/intelligence/tests/skill-regression'
sourceHash: '41081041f2cc724f70b6167518391107c3416a201a4cb31814ad4a6f507e7b68'
compiledAt: '2026-08-28T01:22:11.933Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['authority.test.ts', 'evaluator.test.ts', 'fixture.test.ts', 'scorer.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisProvider, AnalysisRequest, AnalysisResponse } from '../../src/analysis-provider/interface.js'
import { deriveRegressionAuthority } from '../../src/skill-regression/authority.js'
import { SkillRegressionEvaluator, computeBaselineScore } from '../../src/skill-regression/evaluator.js'
import { fixtureSchema, parseFixture, serializeFixture } from '../../src/skill-regression/fixture.js'
import { judgeResponseSchema } from '../../src/skill-regression/prompts.js'
import { aggregateAtK, deriveRegressionVerdict, regressionFloor, weightedScore } from '../../src/skill-regression/scorer.js'
import { CriterionJudgment, GoldenBaseline, RubricCriterion, SkillRegressionFixture } from '../../src/skill-regression/types.js'
import { describe, expect, it, vi } from 'vitest'
```
