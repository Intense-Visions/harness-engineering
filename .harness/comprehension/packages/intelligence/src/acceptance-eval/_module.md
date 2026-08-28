---
schemaVersion: 1
module: 'packages/intelligence/src/acceptance-eval'
sourceHash: 'b11e7c5e31b254385e496f140622958d745494ae0ed672036ee4a602d55c668e'
compiledAt: '2026-08-28T01:22:11.827Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['authority.ts', 'evaluator.ts', 'index.ts', 'prompts.ts', 'types.ts']
---

## Summary

acceptance-eval is a pre-execution acceptance-criteria judge that evaluates whether a spec section contains measurable, testable success criteria. The AcceptanceEvaluator class analyzes a spec (provided directly or read from markdown) and returns a verdict on three dimensions: (c) Measurability (MEASURABLE/NOT_MEASURABLE/INCONCLUSIVE), (a) Criteria quality (advisory findings on observability/testability/completeness), and (b) Test coverage (advisory findings on untested behaviors). The verdict includes a confidence level (low/medium/high) and an authority (blocking or advisory). Only specs judged NOT_MEASURABLE _and_ high-confidence are blocking; all others are advisory. The module composes an LLM judge via AnalysisProvider with strict schema enforcement, section resolution (reusing outcome-eval's logic), and a pure TypeScript authority gate that derives authority from (measurability, confidence) and rejects any LLM-supplied authority field.

## Invariants

- Authority is computed in TypeScript via deriveAcceptanceAuthority(), never read from the LLM; the Zod schema is .strict() and rejects any injected 'authority' field at the parse boundary
- Blocking gate fires only on NOT_MEASURABLE + high confidence; all other combinations (MEASURABLE, INCONCLUSIVE, and all low/medium confidences) are advisory
- Confidence calibration is conservative: default to medium, high requires naming a specific criterion and citing it in the rationale, low for ambiguous sections; bias toward advisory caution
- No GraphStore persistence: unlike OutcomeEvaluator, acceptance-eval has no graph node type and Phase 1 does not persist (design decision per plan D-P1-3)
- Section resolution is defensive: either accepts pre-resolved specSection or reads from specPath and resolves via resolveSection; null/empty sections degrade to INCONCLUSIVE/advisory verdict
- LLM responses are re-parsed after provider analysis to enforce strict schema and reject extra keys; defensive strict re-parse is the false-positive-critical seam
- Two advisory finding channels are independent: criteriaFindings for quality observations (a), coverageFindings for coverage observations (b); both may be empty and are always advisory
- Graceful error degradation: any error during judgment (file read, LLM call, schema parse) returns INCONCLUSIVE/low-confidence advisory verdict rather than failing hard

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
