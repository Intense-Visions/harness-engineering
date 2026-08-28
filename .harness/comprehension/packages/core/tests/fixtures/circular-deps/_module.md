---
schemaVersion: 1
module: 'packages/core/tests/fixtures/circular-deps'
sourceHash: '6b828b44b6a00baeb6967347f0e1a597f0aa3bba05ae7c6310926b4f601387cc'
compiledAt: '2026-08-28T01:22:10.854Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['a.ts', 'b.ts', 'c.ts']
---

## Summary

This fixture models a three-way circular dependency (a → b → c → a) designed to test circular-dependency detection. Each module exports a function that composes the previous module's export in sequence: a() calls b(), b() calls c(), and c() calls a(). The fixture is intentionally broken at runtime — executing it would throw due to undefined references during module initialization (each import tries to call a function before its module finishes loading).

## Invariants

- Cycle closure: a imports b, b imports c, c imports a — forms a complete cycle with no external entry point
- All three exports are required: the interface contract (export a, b, c) means any tool scanning this fixture must detect all three cycle members, not just the first two
- No initialization-time escape: none of the circular calls are delayed (e.g., inside lazy getters or promise handlers) — they execute synchronously during module load, making the failure deterministic and testable
- Fixture integrity: modifying any import/export breaks the fixture's ability to test cycle detection; the cycle is the entire point

## Interface Contract

```ts
export a
export b
export c
```

## Dependency Slice

```
import { a } from './a'
import { b } from './b'
import { c } from './c'
```
