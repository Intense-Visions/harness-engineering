---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/deps-node-modules-cycle/src'
sourceHash: 'a8649dff47406fb10e694255c1d0e2cc191a880c63fe918af3d9b102aed97116'
compiledAt: '2026-08-28T01:22:09.711Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This is a minimal test fixture module for validating handling of cyclic dependencies in node_modules. It exports a single constant `app` with value `1`. The module serves as a dependency stub within the `deps-node-modules-cycle` fixture, likely used to exercise the cli's behavior when encountering circular dependency graphs during scanning or analysis.

## Invariants

- Exported symbol `app` must remain a numeric constant — Consumer tests likely check that the export resolves correctly despite being part of a cyclic graph; changing to a different type or removing the export breaks the fixture's cycle-detection contract.
- Module must remain at `packages/cli/tests/fixtures/deps-node-modules-cycle/src/index.ts` — The fixture path is load-bearing; moving or renaming breaks the cli's cycle-detection test harness.

## Interface Contract

```ts
export app
```

## Dependency Slice

```

```
