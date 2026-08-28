---
schemaVersion: 1
module: 'packages/intelligence/tests/acceptance-eval'
sourceHash: '2d8e7b5c27000881f8698f3dbbbc6da6739e637b4e09ad288e90e48dc3d0b423'
compiledAt: '2026-08-28T01:22:11.882Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['authority.test.ts', 'evaluator.test.ts', 'exports.test.ts', 'prompts.test.ts', 'schema.test.ts']
---

## Summary

packages/intelligence/tests/acceptance-eval is a comprehensive test suite validating the acceptance evaluation pipeline. It ensures specs with success criteria are reliably judged for measurability (whether acceptance criteria are observable/testable) and that authority (blocking vs advisory) is derived deterministically from measurability + confidence, never trusting LLM output. The module guards three critical paths: (1) authority derivation — only NOT_MEASURABLE + high confidence yields "blocking"; (2) spec evaluation — reading success criteria, calling the LLM provider, strict schema re-parse, deterministic authority derivation; (3) graceful degradation — missing specs, provider outages, malformed payloads, and LLM injection attempts all flatten to INCONCLUSIVE/advisory without leaking secrets.

## Invariants

- Authority is blocking iff NOT_MEASURABLE + high confidence — all 8 other (measurability, confidence) pairs are advisory; this is the sole condition where a gate blocks
- INCONCLUSIVE is always advisory — independent of confidence level; used when no judgable section exists or evaluation fails
- MEASURABLE is always advisory — independent of confidence; presence of a measurable criterion does not trigger blocking
- No-section short-circuit — if the spec has no Success Criteria section, return INCONCLUSIVE/advisory without calling the provider
- LLM authority is never surfaced — any authority key in the provider response is stripped; only the deterministic derivation (via deriveAcceptanceAuthority) sets authority
- Secret-safe error degradation — provider errors degrade to INCONCLUSIVE/advisory; error messages are sanitized and never included in rationale
- Strict schema enforcement — malformed LLM payloads fail re-parse and degrade to INCONCLUSIVE, not crash
- Missing spec is non-fatal — missing spec file returns INCONCLUSIVE/advisory without calling provider
- System prompt must forbid authority emission — the prompt instructs the model never to output an authority key, preventing injection
- Provider is called only when there's a judgable section — Success Criteria section detected → provider called with the spec + test content

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
