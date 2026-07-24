---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): point the eval MCP tools at the local reasoner

The eval MCP tools (`acceptance_eval` / `outcome_eval`) can now run their LLM
judgment against a local `/v1` endpoint, but nothing told them which one — so a
fully-local run still degraded to an advisory stub.

At startup the orchestrator now derives the analysis endpoint/model from the
THINKING-mode backend (the reasoner) and applies it to `process.env`
(`HARNESS_ANALYSIS_BASE_URL` / `HARNESS_ANALYSIS_MODEL`). Codex spawns with
`env: process.env`, so the harness MCP server it injects into local execution/
verify stages picks it up — the verify stage's `outcome_eval` then judges the
coder's impl-vs-spec via the reasoner, on-device. An explicit operator value
always wins; a non-local config (no thinking-mode endpoint) is a no-op.
