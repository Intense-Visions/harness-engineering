---
schemaVersion: 1
module: 'examples/hello-world/src'
sourceHash: 'fb8ac05185cce19ac251652db6b1febe27789c6da1547e4ef96131aaa46bd9ee'
compiledAt: '2026-08-28T01:22:08.579Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'utils.ts']
---

## Summary

**hello-world** is a minimal greeting utility that exports a single `greet(name: string): string` function. It produces a formatted greeting string by delegating name formatting to an internal `formatName` helper. The helper applies title-case normalization (first letter uppercase, remainder lowercase) and handles empty input gracefully by returning an empty string.

## Invariants

- `greet` is the sole public export — `formatName` is an implementation detail, not part of the contract.
- `formatName` always returns a string — even for falsy input (empty string, null-like), the function must not return null/undefined, or `greet` will break string interpolation.
- Empty input → empty output — `formatName('')` returns `''`, not `'Undefined'` or other pollution; this preserves empty names in greetings.
- Title-case is deterministic — the first character is always uppercase, the rest always lowercase; no locale-aware or edge-case casing logic.
- Greeting format is fixed — the template `Hello, {formatted name}!` cannot be parameterized; callers must accept this exact format.

## Interface Contract

```ts
export greet
```

## Dependency Slice

```
import { formatName } from './utils'
```
