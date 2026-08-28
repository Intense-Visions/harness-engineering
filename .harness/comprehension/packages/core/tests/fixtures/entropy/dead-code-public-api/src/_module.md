---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-public-api/src'
sourceHash: '55a8b8b529e04d3e5622d72b8467f0cc79b2dd6d3ceedd914ce49f174363f4cb'
compiledAt: '2026-08-28T01:22:10.857Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['budget.spec.ts', 'budget.ts', 'consumer.ts', 'index.ts']
---

## Summary

Fixture demonstrating dead-code taxonomy: distinguishes between genuinely used exports (usedPublic), test-only re-exports (testOnlyPublic), advisory dead public APIs (deadPublic), intentional public surface marked with @public (annotatedPublic), and deletable internal dead code (internalDead). The barrel (index.ts) gates what counts as "public" vs "internal"; workspace-wide imports determine liveness.

## Invariants

- Barrel re-export is prerequisite for PUBLIC_API_UNUSED detection — only functions in index.ts exports can be flagged as dead public API; non-exported symbols are NO_IMPORTERS (deletable internal) instead
- Test-suite imports count as live consumers — testOnlyPublic is live despite being imported only by budget.spec.ts (per #1409)
- @public JSDoc signals intentional adopter-facing API — annotatedPublic should never be flagged as dead even with zero workspace callers; requires separate deprecation strategy
- Workspace-wide imports alone determine liveness — calls from outside the source module (consumer.ts calling usedPublic) make a re-exported function live; local re-export + no external importer = deadPublic (advisory)
- Distinction between advisory and deletable dead code is crisp — deadPublic (re-exported, unused) requires deprecation path; internalDead (not re-exported, unused) is immediately deletable

## Interface Contract

```ts
export annotatedPublic
export deadPublic
export testOnlyPublic
export usedPublic
```

## Dependency Slice

```
import { testOnlyPublic, usedPublic } from './index'
```
