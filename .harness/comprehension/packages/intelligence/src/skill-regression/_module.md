---
schemaVersion: 1
module: 'packages/intelligence/src/skill-regression'
sourceHash: 'd949b8ebc823a39244373f29cc9635a7c63b9bd4ddb40464b2c6489c7e280f06'
compiledAt: '2026-08-28T01:22:11.866Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['authority.ts', 'evaluator.ts', 'fixture.ts', 'index.ts', 'prompts.ts', 'scorer.ts', 'types.ts']
---

## Summary

**skill-regression** is a golden-fixture evaluation framework that detects skill regressions. It orchestrates an LLM judge to score k candidate outputs against a quality rubric (one criterion per judgment), then TypeScript aggregates the scores and compares them to a recorded golden baseline. The verdict is REGRESSED (below baseline – tolerance), STABLE (at or above), or INCONCLUSIVE (on infrastructure failure). Authority is **blocking** only for REGRESSED + high confidence; all other cases are advisory, preventing noise from blocking skill PRs. The evaluator is degrade-safe throughout: provider failures or malformed payloads default to INCONCLUSIVE/advisory rather than throwing. Golden fixtures are byte-stable (canonical key order, trailing newline) for no-op diffs on unchanged values.

## Invariants

- Authority is TS-computed, never LLM-injected: verdict and confidence → authority mapping happens in TypeScript (deriveRegressionAuthority), not via the model. Schema strictly rejects injected keys.
- Strict schema parsing with defensive re-parse: judge response uses .strict() Zod validation; evaluator performs defensive re-parse rejecting any extra keys (authority, score, etc.) even if provider was lax.
- Blocking requires REGRESSED + high confidence: authority is blocking only when verdict=REGRESSED AND confidence=high. All other combinations (INCONCLUSIVE, STABLE, low/medium confidence) are advisory.
- Lowest-confidence bias across candidates: when evaluating k candidates, the verdict's confidence is the minimum of all candidate confidences, biasing toward the least-certain sample.
- Byte-stable fixture serialization: fixtures serialize with canonical key order, 2-space indent, trailing newline. Unchanged values produce no-op diffs; optional fields only emit when present.
- Rubric IDs must be distinct: schema enforces unique criterion IDs via custom superRefine. Duplicates cause one ruling to silently map to multiple criteria, inflating totalWeight and skewing scores.
- Score never from LLM: computed in TypeScript from weighted rubric rulings; only criteria judgments come from the model. Authority is similarly TS-derived.
- Baseline immutability on degrade: computeBaselineScore returns null on provider failure or malformed response, allowing callers to leave existing baseline untouched rather than writing a degenerate 0.
- Empty candidates self-test: if no candidates supplied, evaluator tests against fixture.referenceOutput, enabling self-validation of the fixture's rubric and baseline.
- Degrade-safe infrastructure: provider rejection or schema parse failure → INCONCLUSIVE/low/advisory verdict (no throw). Skill PRs are never blocked on infrastructure noise.

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
