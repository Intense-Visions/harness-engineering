---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Fix `harness recommend` crashing with `Unexpected token 'E', "Error: Max"... is not valid JSON` on repos with very large drift reports.

Root cause: `generateSuggestions` in `@harness-engineering/core` spread sub-arrays into `Array.push` (`suggestions.push(...subList)`), exceeding V8's argument-count limit (~65k) on a 322k-entry drift report and throwing `RangeError: Maximum call stack size exceeded`. The cli's `parseToolResult` then JSON-parsed the resulting error text and crashed the recommend pipeline.

Core: switched spread-push to `concat` so the suggestion accumulator scales with report size. Cli: made `parseToolResult` honor `isError`, catch parse failures, warn via logger, and fall back to `{}` so a single failing sub-check degrades gracefully instead of taking the whole pipeline down. Both layers gained regression tests with revert-and-fail verified.
