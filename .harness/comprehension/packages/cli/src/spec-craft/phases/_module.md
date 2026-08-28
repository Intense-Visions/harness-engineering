---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/phases'
sourceHash: 'c03df90a9a51decc3fcbe6fc6fabcc1a139792255de3abdaa088aa353512f92e'
compiledAt: '2026-08-28T01:22:09.417Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

**spec-craft/phases** is the CRITIQUE phase of the spec evaluation pipeline. It evaluates a single spec section against a single rubric by invoking the LLM provider, parsing the response as fenced JSON, and emitting a 3-axis `SpecFinding` (tier/impact/confidence) or `null` if the rubric doesn't apply.

The module's interface splits concerns cleanly:

- **`critiqueOne`** — orchestrates LLM call + parsing in one step (for pipeline runs)
- **`parseFindingFromRaw`** — pure parser (for two-step flows where the agent answers the LLM question)
- **`buildPrompt`** — constructs the prompt with the section body, rubric metadata, and response schema
- **`CRITIQUE_SYSTEM_PROMPT`** — conservative directive: respond ONLY with fenced JSON (or literal `null`)

The response format is strict: `{ tier, impact, confidence, message }` where all three axes validate against enumerated values. The section body is truncated to `MAX_BODY_CHARS` to control token cost; the marker `[…truncated for cost…]` signals to the LLM that context is incomplete.

## Invariants

- Fenced-JSON contract is canonical — shared with design-craft/naming-craft; single extractFencedJsonPayload implementation gates all parsing
- Null return (not empty finding) gates rubric skip — callers depend on falsy returns to avoid processing non-applicable rubrics; improves pipeline efficiency
- 3-axis tuple (tier/impact/confidence) validates strictly — malformed or out-of-enum values produce null, never a partial finding
- Parsing is split: critiqueOne vs parseFindingFromRaw — enables two-step flows where a human or agent answers the LLM question, then parsing reuses the same logic
- Section body truncation is marked — appending […truncated for cost…] signals incomplete context to the LLM; truncation is deterministic (MAX_BODY_CHARS constant)
- Priority is derived deterministically — derivePriority(tier, impact, confidence) produces same output for same axis tuple; downstream callers rely on consistency
- Lineage is auditable — cite field captures both rubricId and source URL; enables tracing finding back to the rule
- System prompt forces conservative output — 'Respond ONLY with fenced JSON' + fallback to null prevents hallucination of findings when rubric doesn't apply

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
import { SpecRubric } from '../catalog/rubrics/index.js'
import { ParsedSection } from '../extract/sections.js'
import { SpecFinding } from '../findings/schema.js'
```
