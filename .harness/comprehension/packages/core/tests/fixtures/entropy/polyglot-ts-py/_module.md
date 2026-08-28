---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/polyglot-ts-py'
sourceHash: '6703f643e82cb6ac19601a7aa69b9a4b5b9074ad300f7a3d78bafb1706172e35'
compiledAt: '2026-08-28T01:22:10.859Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['main.py']
---

## Summary

**polyglot-ts-py** is a minimal polyglot test fixture combining TypeScript and Python in a single directory. It's used to validate entropy/drift detection across mixed language stacks. The TypeScript side defines a Node package ("polyglot") with a simple export in `src/index.ts`, while the Python side declares a separate project ("sidecar") with a stub `main.py`. Both sides have proper project configuration files.

## Invariants

- Dual package names: package.json names the project 'polyglot', while pyproject.toml names it 'sidecar' — tests that language-aware scanners don't conflate metadata across ecosystems.
- Separate entry points: TS via src/index.ts, Python via main.py — ensures the system can identify multiple root modules in one tree.
- Minimal but complete: Both sides include valid project configs and at least one source file — sufficient to trigger language-specific comprehension without noise.
- Coexistence without conflict: No cross-language imports or dependencies — tests that the toolchain handles polyglot repos without forcing a single language model.

## Interface Contract

```ts

```

## Dependency Slice

```

```
