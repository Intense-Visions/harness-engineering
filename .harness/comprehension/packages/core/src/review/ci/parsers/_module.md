---
schemaVersion: 1
module: 'packages/core/src/review/ci/parsers'
sourceHash: '8cf7b5eff2be4119c9d0d5d93c610efb83010ceadd628b449a8f84b0e7b85cfe'
compiledAt: '2026-08-28T01:22:10.471Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['antigravity.ts', 'claude.ts', 'codex.ts', 'gemini.ts', 'local.ts']
---

## Summary

This module normalizes code review verdicts from five different runners—Antigravity (agy CLI), Claude CLI, Codex CLI, Gemini headless, and a local OpenAI-compatible provider—into a unified `CiReviewVerdict` type. Each parser handles its runner's distinct output format (plain JSON, nested transcript envelope, JSONL stream, structured envelope, or flat payload), extracts `assessment` ('approve' | 'comment' | 'request-changes') and optional `findings`, and delegates to `buildCiReviewVerdict` for schema validation and exit-code derivation. The module is defensive against malformed or prose-wrapped output and fails explicitly rather than silently.

## Invariants

- Findings validation is deferred: raw `findings` arrays are passed unvalidated to `buildCiReviewVerdict`, which schema-validates them and derives `blockingFindings` and `exitCode` from validated data—parsers do not validate findings themselves.
- Assessment is normalized via mapping or defaulting: Claude, Gemini, and Local use a fallback map to normalize strings to the three canonical values; unmapped values default to `'comment'`. Antigravity and Codex extract assessment directly without mapping.
- Antigravity's JSON extraction uses brace-counting, not general parsing: the module assumes single-object payloads and relies on `{...}` balance-counting to recover JSON embedded in prose, sufficient for CLI verdicts but not a general JSON parser.
- Claude's verdict is double-nested: the envelope's `.result` field is itself a JSON string that must be parsed a second time; the envelope also signals errors via `is_error: true`.
- Codex's verdict lives in the last agent_message event: the JSONL stream's last `item.completed` event with `item.type === 'agent_message'` holds the `.text` field containing the JSON verdict; if multiple agent_message items appear, the last one wins.
- All errors are typed and thrown; no silent pass: parsing failures (missing fields, invalid JSON, no verdict found) throw immediately with descriptive messages, matching the existing error convention across all parsers.

## Interface Contract

```ts
export parseAntigravityVerdict
export parseClaudeVerdict
export parseCodexVerdict
export parseGeminiVerdict
export parseLocalVerdict
```

## Dependency Slice

```
import { CiReviewVerdict, buildCiReviewVerdict } from '../verdict-schema'
```
