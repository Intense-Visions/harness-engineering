---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Make two gate instruments able to fail (#2473 §2, §3). The core and cli `typecheck` scripts now also run a `tsconfig.type-tests.json` project over the test files that carry type-level assertions (`expectTypeOf`, `assertType`, `@ts-expect-error`, or a `@type-gate` marker) — previously `exclude: ["tests"]` left them unchecked, so they passed against the bugs they existed to catch; a root guard test fails when such a file is not listed. `generate:barrels:check` now also compares core's resolved public symbol names against a committed `packages/core/public-symbols.txt`, so a symbol added or removed behind `export *` is caught, and it runs in CI and pre-push.
