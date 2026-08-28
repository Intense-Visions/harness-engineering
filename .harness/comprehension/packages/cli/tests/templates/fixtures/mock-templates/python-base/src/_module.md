---
schemaVersion: 1
module: 'packages/cli/tests/templates/fixtures/mock-templates/python-base/src'
sourceHash: '52124f3dedddfa506031a2db177cfc178474ee929afd6a8b60d4024e50920e26'
compiledAt: '2026-08-28T01:22:10.187Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['__init__.py']
---

## Summary

python-base/src is a minimal template scaffold for the source directory of generated Python projects. It contains a single **init**.py file with a templated module docstring that references {{projectName}}, which acts as a placeholder to be substituted during project generation. The parent template.json defines this as a Python language base template using pip, ruff, and pytest—the file itself serves as a starter point for the project's main package namespace.

## Invariants

- Template marker preservation: The {{projectName}} placeholder must remain unevaluated in the fixture; it is rendered only during actual project instantiation, not during test validation.
- Single-file structure: The fixture contains exactly one file (**init**.py) in the src/ directory—no submodules or additional package structure. Tests consuming this fixture assume this minimal baseline.
- Encoding/escaping boundary: The handlebars syntax {{projectName}} must pass through file I/O and serialization without interpretation during fixture storage; only the downstream template renderer substitutes it.
- Directory naming convention: The containing directory name python-base must match the name field in template.json for consistent fixture discovery and lookup.

## Interface Contract

```ts

```

## Dependency Slice

```

```
