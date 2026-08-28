---
schemaVersion: 1
module: "templates/python-base/src"
sourceHash: "8cd13a0a83310f82310e71ec1611317fbbfeb356fb02ee85bfd2db5a1147bb86"
compiledAt: "2026-08-28T01:22:12.839Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["__init__.py"]
---

## Summary

**`templates/python-base/src`** is a minimal Python package scaffold stub consisting of a single empty `__init__.py` file. It marks the directory as a Python package namespace when instantiated via the template system. The module exports no code—it's part of a project template that establishes baseline tooling configuration (Ruff for linting/formatting, pytest for testing) and project metadata. When users invoke `harness init-project`, the template system copies this scaffold into a new project's `src/` directory and renders accompanying `.hbs` config files with project-specific values (name, Python version, etc.).

## Invariants

- __init__.py must exist — Python requires this file to recognize src/ as a package; its absence breaks imports downstream of scaffold instantiation.
- Template scaffolding is the only user — This stub's only purpose is to be copied into newly initialized projects; it is never imported or extended directly.
- Merge strategy is 'overlay-wins' — When the template is applied, conflicting files in the target project are skipped in favor of existing content; this stub will not overwrite a pre-existing src/__init__.py.
- Package manager is pip (not poetry/uv) — Coupled to pyproject.toml.hbs and tooling declarations; changing would require coordination across template metadata.

## Interface Contract

```ts

```

## Dependency Slice

```

```
