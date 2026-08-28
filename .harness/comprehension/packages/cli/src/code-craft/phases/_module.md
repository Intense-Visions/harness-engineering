---
schemaVersion: 1
module: 'packages/cli/src/code-craft/phases'
sourceHash: '07f07b1830cbcb0bc46da0c43b90da4f61f5884673b053c96543bb8f33de4799'
compiledAt: '2026-08-28T01:22:08.760Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The **critique phase** invokes an LLM per (unit, rubric) pair to judge code quality on soft, judgment-based axes that rule-based linters can't catch — intent clarity, control-flow honesty, abstraction value, simplicity. The phase sends only the unit's source snippet (max 2500 chars), not the whole file, to scale cost. The LLM responds with fenced JSON; the module parses that into a three-axis finding (tier: foundational/polish/aspirational; impact: small/medium/large; confidence: high/medium/low). The system prompt enforces a conservative-confidence bias — defaulting to "medium" and encouraging `null` returns — because a report full of low-value nits erodes trust faster than a missed nicety. The `critiqueOne` function chains LLM call → parsing; `parseFindingFromRaw` is pure (no LLM call) so calling agents can re-parse after editing. Both reuse the same fenced-JSON contract across the craft family (design-craft, naming-craft, docs-craft, security-craft).

## Invariants

- Rubric applicability is upstream — critique only handles units where the rubric's appliesToKinds includes unit.kind; filtering happens before this phase runs
- MAX_UNIT_CHARS (2500) truncation is firm — large units are trimmed to control prompt size and LLM cost
- Confidence policy is critical — the system prompt explicitly biases toward 'medium' and `null` to avoid shallow nit-spam eroding trust
- Fenced JSON is the contract — raw response must be parseable JSON wrapped in fences; literal string `null` signals no finding; any parse failure returns `null`
- Three-axis enum validation is gating — tier, impact, and confidence must each pass strict enum validation or the finding is rejected; message must be non-empty
- Priority is derived, not provided — the LLM returns three axes; the module derives a single priority value via `derivePriority(tier, impact, confidence)` for ranking
- Source attribution is always present — each finding includes rubric ID and source URL for audit trail and decision tracing

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
import { CodeRubric } from '../catalog/rubrics/index.js'
import { unitSource } from '../extract/units.js'
import { CodeFinding, CodeUnit, Confidence, Impact, Tier } from '../findings/schema.js'
```
