---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/python-drift-sample/demo'
sourceHash: 'c7e6f2104d78ecdba6ddbe57bca3381583bdfb0468a81ee28137907cd9d75e74'
compiledAt: '2026-08-28T01:22:10.860Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['__init__.py', 'api.py']
---

## Summary

`demo` is a minimal Python test fixture for drift detection. It contains two symbols: `my_function()` returning `"ok"` and `MyClass.method()` returning `self`. The module serves as a ground-truth implementation baseline against which documentation or version snapshots are compared to detect when they have drifted.

## Invariants

- Module structure: **init**.py empty, api.py as sole public container
- Symbol names `my_function` and `MyClass.method` are hardcoded in test harnesses; renaming breaks comparison
- Return values are baselines: `my_function()` → string `"ok"`, `method()` → object reference `self`
- Intentionally minimal; adding symbols alters test surface and skews drift metrics
- Fixture referenced by multiple entropy/drift test cases; deletion cascades failures

## Interface Contract

```ts

```

## Dependency Slice

```

```
