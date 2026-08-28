---
schemaVersion: 1
module: 'packages/intelligence/tests/skill-regression'
sourceHash: '41081041f2cc724f70b6167518391107c3416a201a4cb31814ad4a6f507e7b68'
compiledAt: '2026-08-28T01:22:11.933Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['authority.test.ts', 'evaluator.test.ts', 'fixture.test.ts', 'scorer.test.ts']
---

## Summary

This module tests a skill-regression detection system that measures whether a skill's output quality has degraded from a golden baseline. The pipeline evaluates candidate outputs against a rubric, scores them using weighted criterion judgments, and emits a verdict (STABLE/REGRESSED/INCONCLUSIVE) with authority (blocking/advisory). Core flow: Fixture (rubric + baseline) → SkillRegressionEvaluator (delegates judgment to an AnalysisProvider) → scoring via weighted criteria → authority derivation (high-confidence REGRESSED = blocking; everything else = advisory). Key design: strict re-parsing rejects injected provider keys; degradation on provider failure downgrades to INCONCLUSIVE/advisory; baseline tolerance is a fixed floor.

## Invariants

- Authority rule is strict: only high-confidence REGRESSED verdicts block; low/medium REGRESSED and all STABLE/INCONCLUSIVE are advisory
- Scoring is weighted, not binary: criteria have weights; missing a high-weight criterion lowers the score; absent criteria count as not-met (no silent inflation)
- Baseline tolerance is absolute floor: a score below baseline.score - tolerance triggers REGRESSED (not relative)
- Provider rejection degrades to INCONCLUSIVE: if AnalysisProvider throws, verdict downgrades to INCONCLUSIVE/low-confidence/advisory, not an error
- Strict re-parse rejects injection: evaluator parses response twice with strict field allowlisting; extra keys downgrade to INCONCLUSIVE/advisory
- Fixture schema forbids duplicate rubric IDs: duplicates would inflate total weight; schema enforces strict uniqueness
- Serialization is byte-stable: serializeFixture is deterministic and idempotent regardless of key order; trailing newline always present; omitted optional fields never emitted
- Score@k averages across samples: multiple candidates judged independently, scores averaged, confidence is minimum across all samples

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
