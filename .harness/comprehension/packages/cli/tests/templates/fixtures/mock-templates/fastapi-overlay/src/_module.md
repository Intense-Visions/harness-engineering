---
schemaVersion: 1
module: 'packages/cli/tests/templates/fixtures/mock-templates/fastapi-overlay/src'
sourceHash: 'f4c269f914d89574d15bfd47551628507680747cc04f46babedc72cc41de80e7'
compiledAt: '2026-08-28T01:22:10.176Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['main.py']
---

## Summary

A minimal FastAPI project overlay template fixture used for testing template detection and composition. It declares a FastAPI overlay extending `python-base`, with detection rules targeting `requirements.txt` or `pyproject.toml` files containing "fastapi". The source placeholder is a bare FastAPI app instantiation in `main.py`, providing the minimal scaffolding the template system injects into detected FastAPI projects. Located in `packages/cli/tests/templates/fixtures/mock-templates/`, it tests how layered template overlays compose with base templates in the CLI's template system.

## Invariants

- Detection rules must reference real dependency markers (requirements.txt, pyproject.toml); detection will silently fail if these don't exist or contain unexpected formats
- `extends: "python-base"` must resolve in the template registry; missing base template breaks overlay merging
- Language and framework fields (python, fastapi) are immutable and used by downstream tooling for routing; changes break template classification
- `version: 1` gates migration logic; incrementing it signals backward-incompatible schema changes to consumers
- `src/main.py` must be syntactically valid Python; syntax errors propagate to scaffolded projects

## Interface Contract

```ts

```

## Dependency Slice

```

```
