---
schemaVersion: 1
module: 'packages/intelligence/src/skill-regression'
sourceHash: 'd949b8ebc823a39244373f29cc9635a7c63b9bd4ddb40464b2c6489c7e280f06'
compiledAt: '2026-08-28T01:22:11.866Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['authority.ts', 'evaluator.ts', 'fixture.ts', 'index.ts', 'prompts.ts', 'scorer.ts', 'types.ts']
---

## Interface Contract

```ts
export CriterionJudgment
export GoldenBaseline
export JudgeResponse
export RegressionAuthority
export RegressionConfidence
export RegressionVerdictKind
export RubricCriterion
export SKILL_REGRESSION_SYSTEM_PROMPT
export SkillRegressionEvaluator
export SkillRegressionEvaluatorOptions
export SkillRegressionFixture
export SkillRegressionInput
export SkillRegressionVerdict
export aggregateAtK
export buildUserPrompt
export computeBaselineScore
export criterionJudgmentSchema
export deriveRegressionAuthority
export deriveRegressionVerdict
export fixtureSchema
export judgeResponseSchema
export parseFixture
export regressionFloor
export serializeFixture
export weightedScore
```

## Dependency Slice

```
import { AnalysisProvider } from '../analysis-provider/interface.js'
import { deriveRegressionAuthority } from './authority.js'
import { JudgeResponse, SKILL_REGRESSION_SYSTEM_PROMPT, buildUserPrompt, judgeResponseSchema } from './prompts.js'
import { aggregateAtK, deriveRegressionVerdict, weightedScore } from './scorer.js'
import { Confidence, CriterionJudgment, GoldenBaseline, RegressionAuthority, RegressionVerdictKind, RubricCriterion, SkillRegressionFixture, SkillRegressionInput, SkillRegressionVerdict } from './types.js'
import { z } from 'zod'
```
