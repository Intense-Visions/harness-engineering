---
schemaVersion: 1
module: 'packages/cli/src/shared/craft'
sourceHash: '17977cd076d61e99a4ef2c22a447bf5a614174586fce7ecf48f89fd88119681d'
compiledAt: '2026-08-28T01:22:09.341Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['diagnostics.ts', 'fenced-json.test.ts', 'fenced-json.ts']
---

## Summary

packages/cli/src/shared/craft is a two-part shared foundation for the craft skill family (copy, spec, security, naming, docs, knowledge, code, test, api, cli-ergonomics). diagnostics.ts solves issue #896: craft skills can return empty findings for fundamentally different reasons (no backend available, unsupported-language project, no analyzable input) that all look identical without context. A single canonical diagnostic formatter (formatCraftDiagnostic) now labels every result with the resolved provider and scan tally, so "analyzed 0 items because X" never reads like "found 0 findings." fenced-json.ts solves issue #1369: craft phases ask LLMs for fenced JSON findings, then extract and parse the body. The old per-family extractors used lazy regex that truncated when a finding's message value itself contained a `fence (e.g., quoting a code block in the critique), silently dropping the finding. The shared extractor is string-aware and brace-balanced: it scans for the first complete JSON value while tracking string boundaries and escapes, so inner` fences (which live inside JSON strings) never derail the parse. Two separate fenced blocks are never merged. Both are load-bearing shared infrastructure—not four copies, one canonical formatter—ensuring diagnostic consistency and robust LLM-response parsing across all craft families.

## Invariants

- Diagnostic always names the provider. describeCraftResolution() must never return an empty string; formatCraftDiagnostic() always includes provider=... so empty results are disambiguated from findings-found results.
- Scan tally semantics are strict. When analyzed === 0 && skipped === 0, the diagnostic reads '0 analyzable <unit>' (nothing to analyze); otherwise 'analyzed N, skipped M' (some input existed). The skipReason explains why. This distinction is the entire point of the module.
- Fenced-JSON extraction is nesting-aware. The extractor must correctly parse JSON containing inner `fences by tracking string boundaries and escape state. A finding whose message contains` must be recovered whole, not truncated.
- String and escape tracking is precise. firstBalancedJson() must correctly identify when a " marks the start/end of a string vs. when it's escaped (\"), so braces, brackets, and backticks inside strings don't affect brace depth balance. Missing or incorrect escape handling breaks parsing of findings with escaped quotes.
- Extractor returns the first complete value, never merges blocks. Given two separate fenced JSON blocks, the extractor returns only the first. The caller can then re-invoke on the remainder to recover the second. A greedy 'match to the last fence' approach would merge both into one invalid blob and lose both findings—this contract prevents that.
- Extractor returns a string, not parsed JSON. Callers own JSON.parse() and error handling. The pre-existing contract is 'return the body string'; the extractor never catches or masks parse errors.

## Interface Contract

```ts
export describeCraftResolution
export extractFencedJsonPayload
export formatCraftDiagnostic
```

## Dependency Slice

```
import { extractFencedJsonPayload } from './fenced-json.js'
import { CraftLlmResolution } from './llm/provider.js'
import { describe, expect, it } from 'vitest'
```
