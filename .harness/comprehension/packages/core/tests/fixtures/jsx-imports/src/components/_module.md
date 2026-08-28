---
schemaVersion: 1
module: 'packages/core/tests/fixtures/jsx-imports/src/components'
sourceHash: '6e24eee2c500a3cdc6c169b95b954052ee262bb6c203a70ac85df7ca1ee5e513'
compiledAt: '2026-08-28T01:22:10.861Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['Button.jsx']
---

## Summary

**Button** is a minimal JSX test fixture exporting a single React component that renders nothing (`null`). It serves as a canonical export target for import-resolution and JSX parsing tests, validating that the comprehension system correctly identifies and handles `.jsx` files with named function exports.

## Invariants

- Named export `Button` must remain as a function-scoped export (not default) — the fixture tests import specificity for named JSX exports
- Component signature (zero-argument function returning JSX-compatible value) must be preserved — validates JSX AST parsing
- File must remain `.jsx` — the fixture suite exercises language/extension detection for JSX vs plain JS modules
- No external dependencies — the fixture's value is its simplicity; adding imports would scope-creep the test intent away from pure export/import validation

## Interface Contract

```ts
export Button
```

## Dependency Slice

```

```
