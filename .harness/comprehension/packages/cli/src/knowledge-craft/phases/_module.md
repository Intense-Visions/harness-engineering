---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft/phases'
sourceHash: 'e1186421fda0a3c714f4ad354b39fc6c090a219c2a6d81717cb61b6b3fd01813'
compiledAt: '2026-08-28T01:22:09.236Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The `knowledge-craft/phases` module implements the CRITIQUE phase of the knowledge-craft pipeline. It evaluates a markdown knowledge entry against a rubric by invoking the LLM provider with a structured prompt, then parses the fenced-JSON response into a 3-axis finding (tier, impact, confidence). The module enforces strict validation on the LLM output and provides a pure parsing function (`parseFindingFromRaw`) for reuse in multi-turn flows. Content is truncated at 4000 chars to control cost, and null responses are treated as intentional passes rather than errors.

## Invariants

- Fenced JSON contract is non-negotiable: LLM response must be valid fenced JSON extracted via extractFencedJsonPayload; invalid JSON returns null finding, no error thrown
- Null is a deliberate pass signal: when LLM returns literal null, it means 'rubric does not apply OR entry is fine' — not a parsing error
- All three enum fields (tier, impact, confidence) must be present and valid: missing or invalid values cause the entire finding to be dropped
- Message is required and non-empty: the message field must be a non-empty trimmed string; empty suggestions are rejected
- Content is truncated at 4000 chars with explicit marker: prevents cost explosion; truncation is marked […truncated for cost…] so downstream knows incompleteness
- Priority is derived, not assigned: derived.priority is computed via derivePriority(tier, impact, confidence) and serves as the canonical sort key
- Rubric identity is single-threaded: a finding's code, cite.rubricId, and the rubric object all reference the same KnowledgeRubric.id; swapping rubrics breaks traceability
- LLM-free parsing is reusable: parseFindingFromRaw is pure and can be called by agents in multi-turn flows to re-parse refined LLM responses without re-invocation

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
import { derivePriority } from '../../shared/craft/findings/derived.js'
import { LlmProvider } from '../../shared/craft/llm/provider.js'
import { KnowledgeRubric } from '../catalog/rubrics/index.js'
import { Confidence, Impact, KnowledgeFinding, Tier } from '../findings/schema.js'
```
