---
'@harness-engineering/orchestrator': patch
'@harness-engineering/types': patch
---

fix(orchestrator): support `reasoningEffort: 'none'` so the codex backend can drive local coder models

The codex backend passed `-c model_reasoning_effort` only for `'low' | 'medium' | 'high'`,
and omitting it fell through to codex's own default — which still sends a reasoning
request. Newer ollama builds REJECT a reasoning request for a model that does not
support one, rather than ignoring it: `"qwen3-coder:30b" does not support thinking`
(`invalid_request_error`). That failed EVERY codex turn against such a model (0 tokens,
0 turns), silently breaking the entire codex-drives-local-coder path.

`reasoningEffort: 'none'` is now a first-class value (type, Zod schema, and the codex
argv builder). It emits `model_reasoning_effort="none"`, which tells codex to omit the
reasoning field entirely. Verified against ollama `qwen3-coder:30b`: `low` and omission
both fail the turn; `none` completes it cleanly.
