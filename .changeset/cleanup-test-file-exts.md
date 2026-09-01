---
'@harness-engineering/cli': patch
---

chore(cleanup): narrow test-file-extension constants to module scope.

Drops the redundant `export` keyword from `TEST_FILE_EXTS`, `TEST_LANG_EXTS`,
and `TEST_SUFFIXES` in `test-craft/extract/test-file-exts.ts`. These are read
only within their own module; the file's public surface is the exported
`isTsJsTestFileName` predicate, which is unchanged. No behavior change.