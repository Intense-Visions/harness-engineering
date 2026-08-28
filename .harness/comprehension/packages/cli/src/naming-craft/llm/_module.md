---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/llm'
sourceHash: 'dba2a9aea9441bd307cc9dd86f90644a6429f3662fffe6f355de881ef36dbd79'
compiledAt: '2026-08-28T01:22:09.296Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['provider.ts']
---

## Summary

The `packages/cli/src/naming-craft/llm` module is a pure re-export barrel that surfaces LLM provider infrastructure from the shared craft layer (`shared/craft/llm/provider.js`). It exports types and utilities (`LlmProvider`, `LlmCallCost`, `MockLlmProvider`, `InSessionLlmProvider`, `PromptDeferredError`, `DeferredPrompt`, `getProvider`, `resolveCraftLlmMode`) for naming-craft to use without duplicating logic. The design intentionally defers extracting this to a fully-shared location until a second non-design craft skill needs the same provider infrastructure—avoiding premature abstraction while keeping shared code accessible.

## Invariants

- No new implementation lives here—all logic resides in shared/craft/llm/provider.js; behavior changes must land there, not in re-exports.
- Re-export completeness is load-bearing: removing or renaming any export breaks naming-craft's public API.
- Extraction to packages/cli/src/shared/llm/ only occurs when a second non-design craft skill requires the provider infrastructure; naming-craft alone is insufficient justification.
- The proposal document at docs/changes/craft-pipeline/naming-craft/proposal.md (Technical Design section) is the authoritative source for this design rationale and scope boundaries.
- Zero new dependencies: adding a dependency here indicates the code should live elsewhere, not in a craft-scoped re-export.

## Interface Contract

```ts
export CraftLlmMode
export DeferredPrompt
export InSessionLlmProvider
export LlmCallCost
export LlmProvider
export MockLlmProvider
export PromptDeferredError
export getProvider
export resolveCraftLlmMode
```

## Dependency Slice

```

```
