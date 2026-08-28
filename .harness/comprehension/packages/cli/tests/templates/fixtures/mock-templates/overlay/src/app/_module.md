---
schemaVersion: 1
module: 'packages/cli/tests/templates/fixtures/mock-templates/overlay/src/app'
sourceHash: 'f787a3420c93f21795bd7044aac82f5b3b3168be1a091d24e43be881119b720e'
compiledAt: '2026-08-28T01:22:10.185Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['page.tsx']
---

## Summary

This is a minimal Next.js app-router page component serving as a fixture in the test suite. The module exports a single React component that renders a simple greeting. It's used as mock template content for testing the overlay/templating system.

## Invariants

- Default export required — Next.js app router demands a default-exported component from `page.tsx` files; removal or named-export-only breaks route resolution.
- JSX return type — component must return valid React elements (currently a `<div>`); component that returns null or a non-JSX value breaks rendering.
- File location specificity — placement in `app/` directory with filename `page.tsx` is the Next.js convention; moving or renaming it breaks fixture semantics for overlay/template testing.

## Interface Contract

```ts
export default
```

## Dependency Slice

```

```
