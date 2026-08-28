---
schemaVersion: 1
module: 'packages/intelligence/tests/outcome-eval'
sourceHash: '8b9ddd17c11fbcc91a2ecd16b569191f2279ad6be44a43945f66f8d3b76d8b10'
compiledAt: '2026-08-28T01:22:11.938Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/intelligence/tests/outcome-eval` is a test suite for spec-based outcome evaluation—judging whether code changes satisfy success criteria by analyzing diffs, test outputs, and optional signals from test runners and code coverage tools.

The module evaluates three paths: (1) Spec-to-verdict via `OutcomeEvaluator` reading markdown specs and asking an LLM provider whether a diff + test output satisfy success criteria, returning verdict (SATISFIED/NOT_SATISFIED/INCONCLUSIVE) and confidence (low/medium/high); (2) Authority derivation—a deterministic function mapping (verdict, confidence) pairs to authority levels (blocking or advisory), always TS-derived, never from LLM; (3) Signal enrichment—optional Canary (test outcomes) and Guardian (diff-coverage) signals append to rationale additively without changing authority, verdict, or confidence.

The evaluator degrades gracefully on provider timeouts, malformed payloads, or missing spec sections, yielding INCONCLUSIVE/advisory verdicts with no secret leakage. Verdicts and metadata persist to GraphStore for downstream consumption.

## Invariants

- Authority is TS-derived only: Verdict + confidence → authority via deterministic deriveAuthority(). LLM payloads are re-parsed via .strict() schema that rejects 'authority' keys, preventing injection.
- Only NOT_SATISFIED + high = blocking: All 8 other (verdict, confidence) pairs yield advisory. INCONCLUSIVE is always advisory regardless of confidence.
- Signals are additive and non-destructive: Canary/Guardian signals append exactly one line to rationale; verdict, confidence, unmetCriteria, and authority remain unchanged. Absent signals yield byte-identical results.
- Spec section resolution has priority order: Success Criteria > User-Visible Behavior > Overview. Matching is case-insensitive and tolerates whitespace variation.
- Graceful degradation on errors: Provider failure, malformed payload, or missing spec sections degrade to INCONCLUSIVE/low/advisory with sanitized rationale (no secrets/stack traces).
- Persistence is faithful and self-describing: The GraphStore execution_outcome node carries the full verdict (verdict, confidence, rationale, unmetCriteria, authority) + commit sha so downstream consumers can reconstruct the verdict from git sha alone.

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
