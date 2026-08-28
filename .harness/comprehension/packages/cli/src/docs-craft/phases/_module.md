---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/phases'
sourceHash: 'c2d79b8bac552498eba3c165d7b78c0d7c84ef2eec534e6759ff6b99f84ed545'
compiledAt: '2026-08-28T01:22:09.168Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The `docs-craft/phases` module's critique phase orchestrates LLM-based quality assessment of documentation against rubrics. It wraps an LLM call with prompt construction, response parsing, and a three-axis validation model. The core flow: `critiqueOne` invokes the LLM provider with a constructed prompt and system instruction; `buildPrompt` assembles context (file path, kind, content, rubric) and truncates content to 6000 chars; `parseFindingFromRaw` extracts fenced JSON, validates the three-axis model (tier/impact/confidence), and returns a DocsFinding or null. The system prompt explicitly targets ceiling-quality critique (teaching clarity, prose vitality, example relevance), not floor issues like broken links. The LLM can return `null` if the rubric doesn't apply or the doc already meets the bar. Priorities are never provided by the LLM—they're always derived post-parse from the three validated axes via `derivePriority`, ensuring consistent scoring.

## Invariants

- Three-axis validation gate — tier, impact, and confidence MUST be valid enums; malformed responses are silently rejected, not escalated
- Fenced JSON contract — LLM response MUST be fenced JSON or the word `null`; responses outside this contract are dropped
- Priority derivation is deterministic — priority is _always_ computed from (tier, impact, confidence) post-parse, never trusted from LLM output
- Null is a valid finding — when rubric doesn't apply or doc passes, the LLM returns literal `null` inside the JSON block; this is handled as "no finding"
- Content truncation is silent — files > 6000 chars are truncated with a marker appended; LLM doesn't know what was dropped, and that's intentional (cost vs accuracy tradeoff)
- Rubric scope is upstream — the critique assumes rubrics from the catalog already encode doc-kind specificity; critique doesn't filter by kind itself

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
import { DocKind, DocsRubric } from '../catalog/rubrics/index.js'
import { Confidence, DocsFinding, Impact, Tier } from '../findings/schema.js'
```
