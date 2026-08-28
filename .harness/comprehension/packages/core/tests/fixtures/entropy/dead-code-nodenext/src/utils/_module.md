---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-nodenext/src/utils'
sourceHash: '0184fd0831dabd13e9d2e3e59c3462dfd3f93348bace683444e6a6dd51564436'
compiledAt: '2026-08-28T01:22:10.857Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['helper.ts']
---

## Summary

This is a minimal test fixture module for entropy dead-code detection. It exports a single utility function `helper()` that returns the string `'helper'`. The module has no external dependencies and is part of a test suite validating dead-code scanner behavior under Node.js ESM conditions.

## Invariants

- Export surface must include `helper` — the sole public contract; removal breaks fixture intent
- Function must return the literal string `'helper'` — test harness likely verifies exact output, not just function presence
- Zero external dependencies — isolation ensures the fixture tests dead-code detection logic, not import-graph traversal
- Fixture positioning matters — nested under `dead-code-nodenext/src/utils` signals it's either intentionally unused (to test detection) or minimally referenced (to test false-positive avoidance)

## Interface Contract

```ts
export helper
```

## Dependency Slice

```

```
