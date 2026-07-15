---
'@harness-engineering/intelligence': patch
'@harness-engineering/orchestrator': patch
---

fix(triage): stop truncating reasoning-model output — the LLM levers now produce real verdicts

The complexity tie-break, the open-decisions lever, and the brainstorm fork generator each
capped the model at a tiny `max_tokens` (256 / 512 / 512). A reasoning model (Qwen3 et al.)
emits a `<think>` trace BEFORE the JSON, so those caps truncated mid-reasoning →
`finish_reason: length` → empty content. The failure was then swallowed:

- `llmTiebreak` catches the error and returns a hardcoded `{ level: 'moderate', confidence: 'low' }`,
- the open-decisions lever degrades to `unknown`,
- the brainstorm fork halts as `error`.

So on a reasoning model the triage levers never ran on the real output — the "verdict" was a
fail-safe fallback that only _looked_ like a judgment. Non-reasoning models (which emit no think
trace) fit the tiny caps and masked the bug.

Raised each cap to 4096. `max_tokens` is a ceiling, not a target — a non-reasoning model still
stops at ~14 tokens — so this is free on the fast path and only spends tokens when a model
actually reasons. Verified end-to-end: on Qwen3 the semantic-read lever now returns a real
`simple/high` (was the `moderate/low` fallback) and the open-decisions lever surfaces real
decisions (was `assessment failed`).
