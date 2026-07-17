---
'@harness-engineering/local-models': minor
'@harness-engineering/orchestrator': minor
---

feat(lmlm): probe + store per-model agentic tool-calling capability; require it for build routing

The pool ranked local models purely on benchmark scores, so a model that can't drive an agentic
build (it emits tool calls as TEXT the coding-agent SDK can't parse — e.g. qwen2.5-coder:7b) could
rank top and silently no-op a build. Bake the capability into the pool so selection is aware of it:

- **`probeToolCalling`** (`local-models`) — cheap-first: gate on Ollama `/api/show` `capabilities`
  (free; no `tools` ⇒ `false` with no inference), then one `/v1` tool-schema call to confirm the
  model actually emits native `tool_calls` (catches the "claims tools but emits text" false
  positive). Any failure ⇒ `undefined` (unknown ⇒ fail-open). The single-call FORMAT probe is
  deterministic, unlike the flaky multi-turn agentic loop.
- **`PoolEntry.toolCalling?`** — additive, round-trips via the existing clone/loader; written once
  per model by the scheduler re-score (an injected probe seam) and never re-probed once decided.
- **`poolStateToCandidates(state, profile, { requireToolCalling })`** — excludes entries known not
  to tool-call (`false`), keeping `true` + unprobed (`undefined`, fail-open).
- **`LocalModelResolver`** requires tool-calling for AGENTIC (tier) use-cases only — a build never
  routes to a text-only model; triage/classification (which needs no tool-calling) is untouched.
- The orchestrator binds the probe to the local backend endpoint when starting the refresh
  scheduler.

Verified live: the probe returns `false` for qwen2.5-coder:7b and `true` for qwen3:8b / qwen3:32b.
This makes the config-ordering fallback a belt-and-suspenders rather than the primary guard.
