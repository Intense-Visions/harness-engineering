---
'@harness-engineering/cli': minor
---

fix(test-craft): refuse to report zero findings for zero critiques (#1346, #1347)

`harness test-craft` could not produce a finding under its own default provider,
and could not see ESM test suites at all. Both failures printed the same thing:
`No test findings.` at exit 0.

**The critique phase never ran (#1346).** `InSessionLlmProvider.callText` throws
`PromptDeferredError` on every call — it queues the prompt for the calling agent
rather than answering it — and `critiqueTest` caught every throw in a bare
`catch {}`. Every `(test × rubric)` pair failed and was discarded. `test-craft`
now refuses that provider up front, the way `naming-craft` already does, and
per-rubric failures are counted into `summary.counts.critiqueErrors` instead of
being dropped.

**Discovery was blind to `.mjs` / `.cjs` / `.mts` / `.cts` (#1347).** The
extension list lived in two places — the discovery walk and a second regex gate
inside `extract/tests.ts` — so the bug had two halves: the walker skipped
`*.test.mjs`, and passing one through `--files` cleared the walker only to be
dropped by the extractor, reporting `filesScanned: 1` against
`testsExtracted: 0`. Both now read from `extract/test-file-exts.ts`.

Measured on a 53-file ESM repo: `0 findings / 60 tests / 9 files / 0 LLM calls`
became `8936 findings / 1117 tests / 53 files / 8936 LLM calls`.

**Behaviour change:** `runTestCraft` and `critiqueTestsInFile` now throw when
handed the in-session provider rather than returning an empty result. Callers
relying on the silent-empty return must configure a real backend via
`agent.backends` + `HARNESS_CRAFT_LLM`, or set `HARNESS_CRAFT_LLM=mock`.

`TestCraftSummary.counts` gains `critiqueErrors` and `testsTruncated`. Both are
required fields, so code constructing that type (rather than only reading it)
needs updating. The CLI now also warns when the per-file cap truncated a file
and notes when nothing source-paired, which silently disables `TEST-R007`.
