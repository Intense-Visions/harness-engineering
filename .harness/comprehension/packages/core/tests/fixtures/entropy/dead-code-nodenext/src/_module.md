---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/dead-code-nodenext/src'
sourceHash: 'd3b23c01acac0302a820ec111319cfd59dc0f737632dfdf3c21f4d48598c8cdb'
compiledAt: '2026-08-28T01:22:10.856Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['app.ts', 'index.ts']
---

## Summary

This is a minimal test fixture for dead-code detection under TypeScript's `nodenext` module resolution. It establishes a three-export barrel pattern (`app`, `helper`, `folderHelper`) via re-exports from submodules, with implementations split across mixed `.ts` and `.js` file extensions to exercise path resolution edge cases. The fixture's sole purpose is to provide a controlled setup for validating that the entropy-cleaner's dead-code detection correctly tracks which exports are live vs. unreachable across extension boundaries.

## Invariants

- Barrel re-export structure: index.ts must re-export exactly the three named exports; the detector validates whether each re-export path resolves and whether the source module is actually imported elsewhere.
- Mixed extension resolution: implementations use both .ts (app.ts) and .js (utils/helper.js, folder/index.js) to test whether path normalization is extension-agnostic during dead-code tracing.
- No external consumers in fixture: the three exports are declared but unused within the fixture; the detector must determine liveness based on whether callers outside this tree reference them (if none do, they are dead).

## Interface Contract

```ts
export app
export folderHelper
export helper
```

## Dependency Slice

```

```
