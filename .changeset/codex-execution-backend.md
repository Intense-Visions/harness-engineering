---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

feat(orchestrator): add a `codex` backend that drives a local model via Codex CLI

A controlled experiment (2026-07) showed the bottleneck for local-model convergence
was our bespoke scaffold, not the model: same model (qwen3-coder:30b), same task,
Codex's apply_patch scaffold shipped a clean multi-file change where the OllamaBackend
tool loop went needs-human 5×. Confirmed across two models (qwen3-coder 266 tests green,
qwen3.6 270 green).

This adds a `codex` backend type — `{ type: 'codex', model, localProvider?, command?,
timeoutMs? }` — that drives a local model through `codex exec --oss --local-provider
<provider> -m <model>`. Unlike the endpoint backends it owns no turn loop: `codex exec`
runs the whole agentic session in one invocation and the backend reports success on
exit 0, surfacing codex's `--json` events as status events for the recorder/black-box.
Foundational piece; wiring the enforced local gate + per-phase routing to treat a codex
execution stage as local-execution is a follow-up.
