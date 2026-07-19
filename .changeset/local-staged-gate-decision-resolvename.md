---
'@harness-engineering/orchestrator': patch
---

Fix the identity-path `stageDecisionFor` seam (added in the prior patch) so it
actually populates the local staged gate's locality signal. It resolved the
backend from the materialized backend's `.name`, but a materialized backend hard-
codes `.name` to its TYPE label (`OllamaBackend.name === 'ollama'`,
`LocalBackend.name === 'local'`), which does not key `agent.backends`. So the def
lookup missed and `run.decision` stayed unset — leaving the prior fix inert: a
fully-local (no-`routing.policy`) staged unit still completed without shipping and
looped. `stageDecisionFor` now resolves the authoritative routing key via
`backendFactory.resolveName(useCase)` (the same key the settle gate looks the def
up under). The regression test now uses a factory whose `resolveName` returns a
routing key distinct from the backend's `.name`, so a revert to reading `.name`
would fail the test.
