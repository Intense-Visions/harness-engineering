---
schemaVersion: 1
module: 'packages/intelligence/src/outcome-eval'
sourceHash: '97a77eb11083b75d97adfbdf3f02ce460ea766a874996e68aadaa1356009ddde'
compiledAt: '2026-08-28T01:22:11.850Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['authority.ts', 'evaluator.ts', 'index.ts', 'prompts.ts', 'section-resolver.ts', 'types.ts']
---

## Summary

outcome-eval is the post-execution spec-satisfaction judge. It evaluates whether an implementation meets the spec's success criteria and produces a 3-valued verdict (SATISFIED | NOT_SATISFIED | INCONCLUSIVE) paired with a confidence level that determines ship authority. The core flow: resolve a judgable spec section, send the section + diff + test output to an LLM with strict prompting, parse the response strictly (rejecting injected keys), derive ship authority deterministically in TypeScript (only NOT_SATISFIED + high confidence blocks; all else advisory), fold in guardian and canary signals as rationale, and persist the verdict to the graph. All failures—missing specs, read errors, LLM timeouts, rate limits—degrade safely to INCONCLUSIVE/low/advisory rather than blocking.

## Invariants

- Authority is TS-derived, never LLM-trusted. Only NOT_SATISFIED + high confidence yields blocking; all other pairs are advisory.
- Missing or empty spec sections skip the LLM call and return INCONCLUSIVE/low immediately, preserving the no-spec contract (referential identity).
- All provider failures degrade gracefully to INCONCLUSIVE/low/advisory; never throw or block.
- Strict re-parse rejects injected keys (e.g., authority), even if the provider included them.
- Verdict is 3-valued (SATISFIED | NOT_SATISFIED | INCONCLUSIVE); confidence is 2-valued (high | low).
- Guardian and canary signals fold into rationale as deterministic one-liners; they never alter verdict or confidence.
- ExecutionOutcome id includes randomUUID() to prevent collision under concurrent evaluation of the same spec path.
- Every evaluation path (judged, no-section, degraded) persists uniformly to the graph after folding signals.
- Verdict → result mapping is binary: SATISFIED → success; any other → failure (INCONCLUSIVE is failure-typed but analytically ignored).
- Spec path is metadata-only (linkedSpecId); no spec node edge is created. Verdict metadata is carried additively so consumers can reconstruct the verdict without re-running.

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
