---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/valid-project/src'
sourceHash: 'a714db59c8200414044a7077e14da8c02e4090f0abded74eddebac2d5a211087'
compiledAt: '2026-08-28T01:22:09.712Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This is a minimal test fixture module that serves as a valid project entry point for CLI testing. It exports a single string constant `hello` with the value `'world'`. The module has no external dependencies and exists purely to provide a canonical "passing" project structure that tests can validate against.

## Invariants

- Export name and type: Must export `hello` as a string constant with value `'world'` — tests may validate the export exists and has this exact value
- No dependencies: The fixture intentionally has zero external dependencies to keep it a reproducible, minimal valid project
- Fixture path invariant: Located at `packages/cli/tests/fixtures/valid-project/src/index.ts` — this path is likely hardcoded in test discovery or fixture resolution logic
- Purpose as control: This fixture represents the 'expected to pass' baseline — any test using it assumes the module and its export are correct; if you change the export name or value, you break tests that depend on finding `hello: 'world'` in a valid project

## Interface Contract

```ts
export hello
```

## Dependency Slice

```

```
