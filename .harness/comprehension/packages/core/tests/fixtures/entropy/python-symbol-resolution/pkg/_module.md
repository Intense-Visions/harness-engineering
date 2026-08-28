---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/python-symbol-resolution/pkg'
sourceHash: 'c945770aeed82e067a03f14ccc425490e694277274e73f3417fccb4d5151fe36'
compiledAt: '2026-08-28T01:22:10.860Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['__init__.py', 'models.py']
---

## Summary

This is a minimal Python module fixture testing symbol resolution for dataclass fields, enums, and method return types. It defines a configuration model (CompanyKnowledge) with public and private fields, a configuration method, and a test-suite-type enum. The fixture is designed to validate that comprehension correctly handles Python-specific patterns: underscore-prefixed private attributes, dataclass defaults, implicit method return types, and enum member resolution.

## Invariants

- Private field convention: \_private_cache must be recognized as private; comprehension should mark it as internal/non-public
- Dataclass field defaults: all three fields must resolve with their default values ("", "TOKEN", 0)
- Method return type inference: refresh() has no explicit annotation but returns self.dashboard_url (inferred as str)
- Enum resolution: SuiteType.E2E_UI and SuiteType.PERFORMANCE must resolve as enum members with string values
- Module-level constant: TIMEOUT_SECONDS = 30 must be indexed as a module export
- Empty **init**.py: public API is defined by models.py, not the package init

## Interface Contract

```ts

```

## Dependency Slice

```

```
