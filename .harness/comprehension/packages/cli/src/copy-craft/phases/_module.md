---
schemaVersion: 1
module: 'packages/cli/src/copy-craft/phases'
sourceHash: 'aa7f2603c344695509513fe3dd858f9ec4e1fd293a044e5b0f47d81799105a8a'
compiledAt: '2026-08-28T01:22:08.973Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The `copy-craft/phases` module implements the CRITIQUE phase of the copy-craft pipeline — automated LLM-driven evaluation of prose-in-code (comments, docstrings, logs, errors) against style/clarity rubrics. It follows a pure/impure split where `buildPrompt` and `parseFindingFromRaw` are pure functions (reusable after in-session follow-up), while `critiqueOne` orchestrates the full LLM call. Each finding gets a 3-axis rating (tier, impact, confidence) and returns `null` (valid result) when the rubric doesn't apply or copy is already fine.

## Invariants

- Fenced JSON contract: LLM response must be either literal `null` or valid JSON with all four fields (`tier`, `impact`, `confidence`, `message`). Malformed responses reject to `null`.
- Axis enum validation: All three axes are validated via type guards (`isTier`, `isImpact`, `isConfidence`). Missing or invalid axes cause the finding to be rejected.
- Message non-empty: Message must be a string with length > 0; empty messages result in finding rejection.
- Snippet truncation at 1500 chars: Prevents runaway prompt sizes; truncated snippets show `[…truncated…]` marker.
- Optional context routing: `line`, `errorType`, `logLevel`, `ref` are added to the prompt only if present in the item; code does not assume all fields exist.
- Null ≠ error: A `null` finding (rubric doesn't apply or prose is fine) is valid output, not a failure state.
- Pure reusability: `parseFindingFromRaw` has no LLM call, so calling agents can re-invoke it after their own in-session processing.
- Target composition: All findings capture `file`, `surface`, `snippet`; `line` is optional per-item.

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
import { CopyRubric } from '../catalog/rubrics/index.js'
import { CopyFinding, ExtractedCopyItem } from '../findings/schema.js'
```
