---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): route a codex execution stage through the enforced local gate + ship

Wires the `codex` backend (#946) into the local execution lifecycle. Adds
`isLocalExecutionBackend` — a superset of `isLocalEndpointBackend` that also includes
`codex` (which drives a local model but has no `endpoint`) — and uses it at the two
gate/ship decision sites (`runLocalWorkflowGate`, `settleWorkflowSuccess`). A codex
execution stage now goes through the same enforced gate (verify: typecheck+lint+test,
then outcome-eval) and ship path as a local-endpoint stage.

This gate is load-bearing, not cosmetic: a live trial showed codex can report a hollow
success — it shipped a syntax error in a file it edited while claiming the gate passed.
The orchestrator's independent enforced gate is exactly what catches that and blocks/
retries. Codex stays OUT of the endpoint-only sites (resolver wiring, local-indirection
prompt template) since it has no endpoint and takes a direct task prompt.
