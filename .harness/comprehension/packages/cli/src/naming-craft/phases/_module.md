---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/phases'
sourceHash: '0f8f0c559d177aa6381b665998a419e748d12b5cf6d731ae85f4d8c502b60b11'
compiledAt: '2026-08-28T01:22:09.298Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The **critique phase** of naming-craft is a single-responsibility pipeline stage that evaluates identifier names against naming rubrics using an LLM. It takes an identifier, a rubric, project conventions, and an LLM provider; constructs a structured prompt with context and rubric metadata; calls the LLM; and parses the response into a typed `NamingFinding` or `null`. The phase is pure—all response parsing is deterministic and side-effect free, delegating only the LLM call itself to the provider. It follows the same fenced-JSON response contract as design-craft phases, supporting both "no finding" (rubric doesn't apply / name is fine) and structured critique (tier, impact, confidence, message). Priority is derived deterministically from the three-axis tuple.

## Invariants

- Fenced JSON contract — LLM response MUST be parseable as fenced JSON; payload is either the literal `null` or a JSON object with `tier`, `impact`, `confidence`, and `message` fields — malformed responses silently become null findings.
- Enum cardinality is fixed — `tier` ∈ {foundational, polish, aspirational}, `impact` ∈ {small, medium, large}, `confidence` ∈ {high, medium, low}; all three enums are validated before construction; wrong values → null finding.
- Identifier-to-convention mapping is 1:many — identifier kind (variable / function / type) maps to exactly one convention key via `kindToConventionKey`; if kind is unmapped, the function still needs to return a valid key or descriptor (currently returns 'types' as fallback).
- Priority is derived, not stored in the LLM response — `NamingFinding.derived.priority` is computed from (tier, impact, confidence) tuple in post-parse; LLM never supplies it, so the derivation function must be stable and deterministic.
- Parsing is pure — `parseFindingFromRaw` has no state, no side effects, and no LLM calls; all validation happens client-side; repeated calls with identical inputs yield identical outputs.
- Null semantics are overloaded — a `null` response from the LLM means 'rubric doesn't apply OR name is fine'; client can't distinguish, and shouldn't need to (both are non-findings).

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
import { NamingRubric } from '../catalog/rubrics/index.js'
import { ExtractedIdentifier } from '../extract/identifiers.js'
import { derivePriority } from '../findings/derived.js'
import { Confidence, Impact, NamingFinding, ProjectConvention, Tier } from '../findings/schema.js'
import { LlmProvider } from '../llm/provider.js'
```
