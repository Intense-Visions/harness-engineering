---
'@harness-engineering/eslint-plugin': patch
---

Fix `no-skipped-tests` and `no-disabled-tests` missing Playwright's `test.describe.skip()`.

Both rules matched a skip by requiring the callee's object to be an `Identifier`, which
only admits a single-level member expression. Playwright namespaces its API, so
`test.describe.skip()` parses with `callee.object` as a `MemberExpression` and fell
through unreported — while the strictly smaller mute `test.skip()` was reported. The
severity was inverted: the spelling that mutes an entire block was the one that passed
lint.

Detection now walks the callee chain and matches any statically written dotted path
rooted at `describe` / `it` / `test` whose final link is `skip`. This covers
`test.describe.skip()` and Playwright modifier chains such as
`test.describe.serial.skip()` / `test.describe.parallel.skip()` alongside the flat
Jest/Mocha spellings, which are unchanged.
