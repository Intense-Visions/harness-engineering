---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): reasoner unstick advisory now actually delivers (native think:false, ~9× faster)

The reasoner unstick advisory (escalate a stuck local coder to the thinking model for a
diagnosis + fix) was calling the reasoner with `disableThinking: false` — forcing Ollama's
`/v1` + structured-output + `<think>` path, which takes ~60s warm and far longer cold or
under model contention (codex holding the coder model). It blew the timeout and was skipped
every time (observed cx4: 2/2 skipped), so the coder retried blind — the escalation was a
no-op in practice.

Switch the advisory to `disableThinking: true`, which the analysis provider already routes
through Ollama's native `/api/chat think:false` path. Benchmarked on qwen3.6:27b: the same
diagnosis in ~6.5s vs ~59s — a fast diagnosis that ARRIVES beats a perfect one that times
out, and the reasoner is a capable diagnostician (a stronger model than the coder) even
without the `<think>` trace. `/no_think` over `/v1` was also measured and is ignored (68–164s),
confirming native is the only reliable fast route.
