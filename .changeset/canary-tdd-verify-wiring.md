---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Wire canary into harness-verify and harness-tdd through the existing adapter seam.

`CanaryAdapter` gains a total `listFrameworks()` method (execs `canary frameworks --json`,
zod-parses the framework registry, returns `[]` on any degrade) and a pure
`resolveTestCommand()` helper that fills the `{file}` placeholder and appends CI flags.
A new MCP tool, `canary_discover_test_command`, matches candidate test files against the
registry by longest file-extension suffix and returns the resolved per-file test command.

`harness-verify` DETECT now consults registry truth for the test command before its
`package.json`/`Makefile` heuristics, and `harness-tdd` RED offers canary-authored failing
tests (detect-and-offer). Both degrade silently to today's behavior when canary is absent —
the dependency stays optional and the adapter boundary is unchanged.
