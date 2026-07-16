---
'@harness-engineering/types': minor
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): add native Ollama agentic backend

Add a production `OllamaBackend` (`type: 'ollama'`) that owns its
`/v1/chat/completions` tool loop instead of embedding the pi-coding-agent SDK.
`startSession` seeds conversation state with a system prompt; `runTurn` drives
the inner agentic loop (call model → execute native `tool_calls`
[`bash`/`write_file`/`read_file`, sandboxed to the workspace with
path-traversal rejection] → append tool results → repeat until the model stops
calling tools), yielding `tool_execution_start`/`tool_execution_end`/`usage`
events and accumulating token usage. Wired through the config schema, the
backend factory, and the analysis-provider factory. This drives Ollama-served
tool-calling models (e.g. qwen3) that the pi/codex SDKs fail against.
