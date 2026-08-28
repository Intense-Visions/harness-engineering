---
schemaVersion: 1
module: 'packages/core/tests/fixtures/jsx-imports/src'
sourceHash: '4d6d40d7285a8f2b00564882c0a94c9e443154f7b1924eb87474e7a238c810a6'
compiledAt: '2026-08-28T01:22:10.861Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['App.tsx']
---

## Summary

This is a minimal test fixture for JSX import resolution. It exports a simple `App` component that imports and calls a `Button` component from a sibling directory. The fixture validates that relative ES module imports with `.js` extensions work correctly across the component tree.

## Invariants

- Named export of `App` — The test harness expects `App` as a named export (not default), to verify explicit export tracking in the module graph.
- Relative import path resolution — `./components/Button.js` must resolve correctly; the `.js` extension signals ESM semantics and tests that the comprehension system doesn't strip or mishandle explicit extensions.
- Import-to-callee relationship — Button is both imported and invoked; the fixture verifies that the symbol import is wired to its usage site (not dead code, not a dangling reference).
- Component-as-function assumption — Button is called directly in the return statement (no JSX syntax here), so the fixture tests that callable imports are recognized even in non-JSX call contexts.

## Interface Contract

```ts
export App
```

## Dependency Slice

```
import { Button } from './components/Button.js'
```
