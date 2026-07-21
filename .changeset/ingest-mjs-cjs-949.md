---
'@harness-engineering/graph': patch
---

Ingest `.mjs`/`.cjs`/`.mts`/`.cts` source files. `CodeIngestor.SUPPORTED_EXTENSIONS` previously omitted ESM/CJS module extensions, so those files produced no graph `file` nodes and `@req` annotations inside them created no `verified_by` edges — silently under-reporting requirement test-verification for repos with `.mjs`/`.cjs` test suites. Fixes #949.
