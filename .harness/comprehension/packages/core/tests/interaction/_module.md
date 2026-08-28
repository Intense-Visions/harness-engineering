---
schemaVersion: 1
module: 'packages/core/tests/interaction'
sourceHash: 'b0bf1b58cb4174b241f36a5e64b63fde3ee87bce34f6952c082e3c75cedf4f45'
compiledAt: '2026-08-28T01:22:10.870Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['types.test.ts']
---

## Summary

This test suite validates five Zod schemas that govern user-interaction contracts within the orchestrator. The schemas define: (1) three interaction types (question, confirmation, transition), (2) Question and Confirmation payloads (with context being mandatory for confirmations), (3) Transition records that describe phase advances with completion metadata and optional auto-progression, and (4) EmitInteractionInputSchema—the top-level discriminated union that pairs a path + type + discriminated payload. All test cases are happy-path validation and explicit rejects of missing required fields.

## Invariants

- Confirmation ALWAYS requires `context` — it is not optional. A confirmation is invalid without it.
- Transition ALWAYS requires both `requiresConfirmation` AND `summary` — these are not optional, even though `requiresConfirmation` can be `false` (auto-transition). The summary must always be present to describe what was completed.
- Transition ALWAYS requires `artifacts` — a non-empty array. A transition without artifacts is rejected.
- EmitInteractionInputSchema is a discriminated union — the `type` field determines which payload must be present: `question` → `question` field, `confirmation` → `confirmation` field, `transition` → `transition` field.
- InteractionTypeSchema only accepts three literal values — 'question', 'confirmation', 'transition'. Any other string or empty string is rejected.
- Path is mandatory in EmitInteractionInputSchema — the top-level input is invalid without it.
- Question text is mandatory, but options and default are optional — a free-form question (text only, no options) is valid.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ConfirmationSchema, EmitInteractionInputSchema, InteractionTypeSchema, QuestionSchema, TransitionSchema } from '../../src/interaction/types'
import { describe, expect, it } from 'vitest'
```
