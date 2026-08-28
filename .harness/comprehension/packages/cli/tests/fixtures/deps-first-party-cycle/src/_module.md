---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/deps-first-party-cycle/src'
sourceHash: '25049fd19d45e7165b287a5cf410e3dc293f87fe89e3f49867411c3b31970fe0'
compiledAt: '2026-08-28T01:22:09.711Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['a.ts', 'b.ts']
---

## Summary

This fixture demonstrates a first-party circular dependency: two modules (a.ts and b.ts) that import each other. Module a imports from b and exports a constant; module b imports from a and exports a constant. It's a minimal two-module cycle designed to test how the codebase detects, reports, or handles circular import graphs in the local package.

## Invariants

- Bidirectional import cycle: a.ts → b.ts → a.ts (direct mutual dependency, not transitive)
- Both modules resolve: despite the cycle, both must successfully export their named values (a = 1, b = 1)
- First-party only: no external dependencies; the cycle is entirely within the fixture's own module scope
- Minimal structure: exactly two modules, exactly one import per module; any reduction breaks the cycle-detection premise

## Interface Contract

```ts
export a
export b
```

## Dependency Slice

```
import from './a'
import from './b'
```
