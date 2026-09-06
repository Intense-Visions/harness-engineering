---
'@harness-engineering/cli': patch
---

Make `test-craft --no-source-pair` actually skip source pairing (#1882)

`harness test-craft --no-source-pair` documented "Skip source-pairing
resolution" and did nothing. Pairing ran on every invocation, so the documented
escape hatch for repos where pairing is slow, noisy, or resolves the wrong
source file simply did not exist — and it said nothing about being ignored.

Commander stores a `--no-x` flag under its **positive** camelCase key —
`sourcePair`, `true` by default and `false` when the flag is passed. It never
creates a `noSourcePair` key. `buildInput` read `opts.noSourcePair === true`,
which is `undefined` on every path, so `input.sourcePair` was never set and the
engine's `input.sourcePair !== false` guard always resolved to enabled. The
`TestCraftCliOptions` interface declared the same non-existent
`noSourcePair?: boolean` field, which is why the unreachable read typechecked
cleanly and survived review — the type declaration was part of the defect, not
incidental to it.

The read is now `opts.sourcePair === false`, matching the idiom already used by
`--no-generate` (`install.ts`), `--no-skills` (`mcp.ts`), and `--no-write`
(`adoption.ts`), and the interface field is renamed to describe what Commander
actually produces. Guarding on the explicit `false` keeps the default path
sending no property at all rather than a redundant `true`.

The engine was never wrong and is unchanged: `runTestCraft({ sourcePair: false })`
already disabled pairing correctly and had an integration test proving it. That
test calls the engine directly, bypassing the CLI, which is exactly why the
broken wiring survived. The regression guard is therefore at the option-parsing
boundary, covering both the passed and the default path.
