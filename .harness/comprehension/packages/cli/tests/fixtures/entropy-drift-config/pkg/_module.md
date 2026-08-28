---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/entropy-drift-config/pkg'
sourceHash: 'dc6bdf467e8c0ff7e9baaa1a4d43e5c744bdce855bbf4481f55655ba76a0fb9e'
compiledAt: '2026-08-28T01:22:09.711Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['__init__.py', 'api.py']
---

## Summary

Minimal test fixture for entropy-drift detection. The `pkg` module exports a single function `real_function()` that returns 1, with accompanying documentation that intentionally contains drift: docs reference both the live function and a removed symbol (`removed_symbol`), making it a canonical test case for detecting doc-code misalignment.

## Invariants

- api.py exports exactly one live function — real_function() must exist and return 1; used to verify detectors correctly identify documented symbols
- docs/api.md documents both live and stale symbols — mentions real_function (correct) and removed_symbol (orphaned reference); the orphaned reference is the drift signal
- No other code exists — the module is intentionally minimal to isolate drift-detection logic from real complexity
- Docs are the source of truth for what should exist — detectors validate code against documented surface area

## Interface Contract

```ts

```

## Dependency Slice

```

```
