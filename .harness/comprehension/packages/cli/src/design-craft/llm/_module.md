---
schemaVersion: 1
module: 'packages/cli/src/design-craft/llm'
sourceHash: '2bad2cd9f519f1942008eefe53c7278cc05734008aaad5da183f12a3971ffeea'
compiledAt: '2026-08-28T01:22:09.053Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['provider.ts']
---

## Summary

The `packages/cli/src/design-craft/llm` module is a re-export shim that maintains backward compatibility for LLM abstractions extracted to a shared location. It exports five symbols (`LlmProvider`, `LlmCallCost`, `VisionInput`, `MockLlmProvider`, `getProvider`) from `packages/cli/src/shared/craft/llm/provider.ts`. The extraction occurred when spec-craft became the second craft consumer requiring the same LLM interface, triggering the move to shared/craft. The shim ensures historical import paths remain functional without modification.

## Invariants

- Re-export contract is exact — all five symbols must remain exported; dropping any breaks backward-compat callers importing from the design-craft path
- Source of truth is shared/craft — actual implementation lives in packages/cli/src/shared/craft/llm/provider.ts; updates there must not alter exported type/function signatures
- Import paths are stable — historical code importing from @harness-engineering/cli/dist/design-craft/llm continues to work; removing this file breaks those imports
- Multi-consumer sharing — the shared location serves both design-craft and spec-craft (and potentially other craft consumers); breaking changes cascade to all dependents

## Interface Contract

```ts
export LlmCallCost
export LlmProvider
export MockLlmProvider
export VisionInput
export getProvider
```

## Dependency Slice

```

```
