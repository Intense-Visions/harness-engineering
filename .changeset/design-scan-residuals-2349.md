---
'@harness-engineering/cli': patch
---

Design scan: skip test-fixture trees (`__fixtures__/`, and `fixtures/` directly under `test/`, `tests/`, `__tests__/`) so deliberately malformed fixtures no longer raise false ANAT/DRIFT/brand findings; return the walked file set in a deterministic, filesystem-independent order; and derive the `harness validate --changed` design surface from the shared walk definition instead of a drifted copy (it was dropping `.vue`, `.svelte`, `.astro`, `.mts`, `.less` and other files the full sweep scans). (#2349)
