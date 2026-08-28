---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-nodenext/src/folder'
sourceHash: '422801474473ec9d0cd44bc9bfc40f8fa1479dbf9d804a7934642fc3585b20f7'
compiledAt: '2026-08-28T01:22:10.855Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This is a minimal test fixture for entropy/dead-code detection in a Node ESNext environment. It exports a single string constant `folderHelper = 'folder-helper'` from `index.ts`. The fixture is intentionally sparse, likely to verify dead-code detection correctly handles simple exported values.

## Invariants

- Export surface: Must export `folderHelper` as a string constant; other code may reference or ignore this export to test detection behavior.
- Path stability: Fixture location at `packages/core/tests/fixtures/entropy/dead-code-nodenext/src/folder` is expected by entropy tests.
- No dependencies: Clean dependency graph (no imports); the fixture is a leaf node for dead-code analysis.
- Module type: ESNext module context; if refactored, must remain compatible with Node ESNext resolution.

## Interface Contract

```ts
export folderHelper
```

## Dependency Slice

```

```
