---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
---

`detect_entropy` (MCP) now scopes its scan exactly as `harness cleanup` does. Whenever `.harness/graph` existed, the tool fed the analyzer graph-derived drift and dead-code data that ignores `entropy.drift.forwardLookingPaths`, `docPaths`, `ignorePatterns`, `excludePatterns` and `entryPoints`; it also rooted the scan on the given path instead of `rootDir` and fell back to the analyzer's README-inclusive doc globs instead of `docsDir`. On this repository the tool reported 1,686,602 issues where `harness cleanup` reported 1,887; drift now matches exactly (1,115 = 1,115). Duplication also runs on graph-bearing projects now, where it previously always refused with `snapshot-bypassed`. Closes #2168.

On Windows, drift doc globs built with `path.join` (including `harness cleanup`'s `<docsDir>/**/*.md` fallback) carried backslashes that `glob` reads as escapes, so drift silently scanned zero docs. `buildSnapshot` now normalizes separators on win32, and the shared scope helper emits forward-slash globs.
