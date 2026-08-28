---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/phases'
sourceHash: 'e28620db79e88d7f7758a77c955735500b39c3f2d8c575e528db7984aef318f8'
compiledAt: '2026-08-28T01:22:08.752Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.ts']
---

## Summary

The `cli-ergonomics-craft/phases` module implements the CRITIQUE phase, which evaluates CLI command definitions against design rubrics using an LLM provider. The core flow is: `critiqueOne()` (main entry point) calls the LLM with a prompt built by `buildPrompt()`, then `parseFindingFromRaw()` parses the fenced-JSON response into a structured `CliErgonomicsFinding` with three axes (tier, impact, confidence) plus a concrete message. The system prompt establishes a ceiling-vs-floor contract: the LLM judges design quality (naming, help text, error messages, defaults, composability, guards) not syntactic correctness. Content is truncated to 6000 chars for cost control. The parse function is pure and reusable, enabling multi-turn flows where an agent confirms or revises the critique before re-parsing.

## Invariants

- Fenced-JSON response contract is strict: LLM must respond with literal `null` or a JSON object with exactly four fields (tier, impact, confidence, message). Any other shape fails validation silently.
- Enum fields are strictly validated: tier ∈ {foundational, polish, aspirational}, impact ∈ {small, medium, large}, confidence ∈ {high, medium, low}. Invalid values gate downstream priority derivation.
- parseFindingFromRaw() is pure with no side effects, enabling reuse in multi-turn flows where an agent confirms the critique and re-parses without a new LLM call.
- Content truncation at 6000 chars prevents token runaway but is lossy—may drop context needed to judge multi-flag interactions. Truncation is logged inline.
- Dependency on extractFencedJsonPayload() from the shared craft library: if that fence-parsing contract changes, this module breaks silently.
- Rubric source is citation-only: the response embeds rubricId and source for traceability but does not validate them against the rubric object—trust the caller to provide a real rubric.

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
import { CliRubric, CommandKind } from '../catalog/rubrics/index.js'
import { CliErgonomicsFinding, Confidence, Impact, Tier } from '../findings/schema.js'
```
