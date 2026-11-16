---
'@harness-engineering/dashboard': patch
---

`typecheck` now also type-checks `tests/` through a new `tsconfig.tests.json`, so a type error in a dashboard test fails the gate instead of passing silently (#2230). The 99 type errors that had piled up unseen in the test files are fixed.
