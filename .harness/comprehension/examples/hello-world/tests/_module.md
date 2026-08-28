---
schemaVersion: 1
module: 'examples/hello-world/tests'
sourceHash: 'e5621a966c05266db44421a915eeece71801a59485910a09d2e75af664e024c5'
compiledAt: '2026-08-28T01:22:08.573Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.test.ts']
---

## Summary

The `examples/hello-world/tests` suite validates two string-manipulation utilities: `greet()` and `formatName()`. The `greet()` function takes a name, formats it (via `formatName()`), and returns a greeting in the pattern `'Hello, <Name>!'`. The `formatName()` function capitalizes the first letter of its input. The tests confirm that both functions work in isolation and that `greet()` correctly applies name formatting before building the greeting string.

## Invariants

- greet() applies formatName(): the greeting output must reflect name formatting (e.g., lowercase input → capitalized in output)
- formatName() is idempotent on capitalized input: 'World' and 'Alice' (already capitalized) must round-trip correctly
- Empty string edge case: formatName('') must return '', not throw or return a single capital letter
- Greeting format is fixed: all outputs follow 'Hello, <CapitalizedName>!' with no variation in punctuation or spacing

## Interface Contract

```ts

```

## Dependency Slice

```
import { greet } from '../src/index'
import { formatName } from '../src/utils'
import { describe, expect, it } from 'vitest'
```
