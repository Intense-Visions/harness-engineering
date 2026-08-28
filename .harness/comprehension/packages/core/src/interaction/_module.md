---
schemaVersion: 1
module: 'packages/core/src/interaction'
sourceHash: 'e1a0f91d9449cfd288e68858be0e1155e98ed44b76d685a3a62dcd93a65d41b8'
compiledAt: '2026-08-28T01:22:10.423Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'types.ts']
---

## Summary

packages/core/src/interaction defines validation schemas and types for agent-to-human interactions via zod. It exports three interaction modes (question, confirmation, transition) as paired schemas/types, plus a root EmitInteractionInput that acts as a discriminated union keyed on InteractionType. Used by automation to solicit user input or signal phase transitions through a type-safe contract.

## Invariants

- Type-payload correspondence: the `type` field in EmitInteractionInput must match the populated optional field (question | confirmation | transition); mixing types and payloads breaks consumer routing
- Required fields per interaction type: Question requires `text`; Confirmation requires `text` + `context`; Transition requires all seven fields (completedPhase, suggestedNext, reason, artifacts, requiresConfirmation, summary)
- Schema/type parity: zod schemas in types.ts are the source of truth; TypeScript types are inferred via z.infer; drift between schema validation and type expectations causes runtime/compile-time mismatches
- Path field is always required and has no default; a missing or malformed `path` in EmitInteractionInput loses the interaction (no routing target)

## Interface Contract

```ts
export Confirmation
export ConfirmationSchema
export EmitInteractionInput
export EmitInteractionInputSchema
export InteractionType
export InteractionTypeSchema
export Question
export QuestionSchema
export Transition
export TransitionSchema
```

## Dependency Slice

```
import { z } from 'zod'
```
