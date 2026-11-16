---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(check-deps): stop passing over source files that fail to parse (#2073)

`buildDependencyGraph` dropped any file it could not parse without a word, so a single syntax error hid every layer violation in that file: `harness check-deps` printed `v validation passed`, exited `0`, and still counted the dropped file as analysed.

- Core: `buildDependencyGraph`, `validateDependencies` and `detectCircularDepsInFiles` now return `unparsedFiles` (path + parser reason) and `analyzedFiles` (source files whose imports were actually read). Directories and non-source files matched by a layer glob stay out of scope. `DependencyValidation.valid` still speaks only to violations.
- CLI: `check-deps` reports each unparseable file by path on the "checks that could not run" channel and refuses a clean verdict — exit `3` (`ZERO_DENOMINATOR`) by default, downgraded to `0` (still reported) under `deps.fallbackBehavior: "warn"`, matching the existing engine-abstention policy.
- CLI: "Analyzed N module(s)" is now the real denominator. It used to count every path the layer globs matched, including directories (2730 on this repo; the real number is 2345).
