---
'@harness-engineering/eslint-plugin': patch
---

Add new ESLint rule `no-disabled-tests` that flags disabled/skipped tests left in source code including `it.skip(...)`, `test.skip(...)`, `describe.skip(...)`, and the bare `xit(...)` / `xdescribe(...)` / `xtest(...)` aliases.
