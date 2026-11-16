---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

fix(comprehension): `harness comprehend --changed` (the pre-commit path) now applies the same module-eligibility rule as `--all`, so it no longer compiles units for dot-directories or `node_modules`/`dist`/`build`/`coverage` paths that no full sweep would ever enumerate. `--check` reports such orphan units (and units whose module directory was deleted) separately from source-stale ones, and the new token-free `harness comprehend --prune` deletes them. Core's `runComprehendCheck` accepts an optional `listModules` and returns `orphans`; `findOrphanModules` is exported.
