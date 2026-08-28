---
schemaVersion: 1
module: 'packages/core/tests/fixtures/fs-utils-default-ignore/src'
sourceHash: '7c02938b0e000c74244ef6a12b52ee90ce24029c049c37d3976680768b7f6635'
compiledAt: '2026-08-28T01:22:10.861Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['code.ts']
---

## Summary

This fixture module provides a minimal source tree to test default ignore patterns in filesystem utilities. It exports a single marker constant `userSource = true`. The fixture simulates a typical project layout with directories that commonly require ignoring (dist/, build/, coverage/, node_modules/) alongside the active source tree (src/), allowing tests to verify that fs-utils correctly excludes these directories by default when scanning.

## Invariants

- Single export contract: userSource must remain a boolean constant at module level — used as a fixture marker to validate scan results
- Fixture structure immutable: The layout of directories (src, dist, build, coverage, node_modules) is part of the test contract — changing or removing directories breaks what the test is validating
- Source-as-minimal-as-possible: The actual src/code.ts content is intentionally trivial; any logic here would dilute the fixture's isolation and make test assertions ambiguous about what they're proving

## Interface Contract

```ts
export userSource
```

## Dependency Slice

```

```
