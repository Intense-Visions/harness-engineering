---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/python-package/mypkg'
sourceHash: '8cd13a0a83310f82310e71ec1611317fbbfeb356fb02ee85bfd2db5a1147bb86'
compiledAt: '2026-08-28T01:22:10.860Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['__init__.py']
---

## Summary

`mypkg` is a minimal Python package stub used as a test fixture for entropy detection. It contains only essential scaffolding: a package declaration in `pyproject.toml` (name, version 0.1.0) and an empty `__init__.py`. The package has no runtime code, exports, or dependencies. It serves as a baseline reference fixture for testing comprehension or entropy scanning against a deliberately sparse, canonical Python package structure.

## Invariants

- **init**.py must exist and remain empty — it is the definitive marker of a Python package
- pyproject.toml must declare at least [project], name, and version — presence and syntax are load-bearing for fixture validity
- Package structure must remain flat with no submodules or source files — any addition changes the fixture's role as a minimal stub
- Version must remain at 0.1.0 — version number changes break digest/hash comparisons in tests relying on fixture stability

## Interface Contract

```ts

```

## Dependency Slice

```

```
