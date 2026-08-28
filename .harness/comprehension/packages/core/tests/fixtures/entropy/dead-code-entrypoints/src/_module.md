---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-entrypoints/src'
sourceHash: 'c2dfbe259e940be87b05597374aadeca064974410133a5a91c783f76c4697b33'
compiledAt: '2026-08-28T01:22:10.856Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['app.config.ts', 'index.ts', 'main.ts', 'orphan.ts', 'used.ts']
---

## Summary

This is a test fixture for dead-code detection that exercises three distinct file categories: build configs (dynamically loaded, unreachable in import graphs), framework entry points (runtime-reachable but not statically imported), and genuinely dead code (orphaned utilities with no importers). The module exports a single `run()` function via `index.ts` that calls into `used.ts`. It's designed to validate that dead-code analysis correctly distinguishes between "unreachable in the import graph but required" vs. "actually deletable."

## Invariants

- app.config.ts must remain: build configs are dynamically loaded by tooling—classify as entry point, not dead code, even though unreachable statically
- main.ts must remain: framework module roots (Vue/Angular/NestJS) are invoked at runtime outside the import graph—must NOT be flagged as deletable
- orphan.ts must be flagged deletable: no importers and not an entry point; represents genuinely dead code that should be pruned
- run() is the public contract: the fixture's external interface is the run() export from index.ts; all other exports are internal helpers for testing classification
- used.ts cannot be removed: it's the sole dependency of index.ts and must be reachable to satisfy the contract

## Interface Contract

```ts
export run
```

## Dependency Slice

```
import { used } from './used'
```
