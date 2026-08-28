---
schemaVersion: 1
module: 'packages/cli/src/test-craft/phases'
sourceHash: 'd39b9cf7a94e2714211f119a16b97cafd45b7f7f0518fcd1504e2e6709ddbd19'
compiledAt: '2026-08-28T01:22:09.461Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The `test-craft/phases` module (critique.ts) implements the CRITIQUE phase, which invokes an LLM to assess individual tests against rubrics and produce structured findings on a 3-axis scale (Tier, Impact, Confidence). The module exports a decoupled two-step flow—prompt-building and response-parsing—allowing batch workflows to collect prompts first, send them to an agent, then parse results back. The LLM responds with either `null` (literal, rubric doesn't apply) or a JSON object with tier, impact, confidence, and message. All enum values are validated before synthesis into a TestFinding that links the finding back to source location and derives priority from the 3-axis values.

## Invariants

- Fenced JSON contract: extractFencedJsonPayload must reliably extract JSON from LLM response; failure silently returns null instead of throwing.
- Enum validation: tier, impact, and confidence must match exactly (foundational|polish|aspirational, small|medium|large, high|medium|low); no coercion; invalid values cause the entire finding to be dropped.
- Null handling: parseFencedJson treats literal 'null' string and null objects both as 'no finding' but rejects non-objects.
- Message field is load-bearing: Required, non-empty string; missing or empty message causes entire finding to return null.
- Phase name is hardcoded: Every TestFinding gets phase: 'critique'—changing this requires coordinating with downstream consumers.
- Priority synthesis: derivePriority(tier, impact, confidence) is the single source of truth for ranking—the 3-axis values feed into it deterministically.
- Two-step flow synchronization: buildPrompt and parseFindingFromRaw are always called with the same test/rubric pair; they must round-trip correctly.
- Target metadata completeness: TestFinding.target captures file, line, testName, nesting, and framework—all required to link findings back to source locations.

## Interface Contract

```ts
export CRITIQUE_SYSTEM_PROMPT
export buildPrompt
export critiqueOne
export parseFindingFromRaw
```

## Dependency Slice

```
import { extractFencedJsonPayload } from '../../shared/craft/fenced-json.js'
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { derivePriority } from '../../shared/craft/findings/derived.js'
import { LlmProvider } from '../../shared/craft/llm/provider.js'
import { TestRubric } from '../catalog/rubrics/index.js'
import { SourcePairResult } from '../extract/source-pair.js'
import { ExtractedTest, TestFinding } from '../findings/schema.js'
```
