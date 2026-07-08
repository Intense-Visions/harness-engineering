---
'@harness-engineering/local-models': minor
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/cli': minor
---

Local Model Lifecycle Manager (LMLM) backend: hardware-aware ranking + pool
manager + Ollama installer in the new `@harness-engineering/local-models`
package; generalized discriminated `ProposalSchema` (`kind: 'skill' | 'model'`,
backward-compatible on read) in types + the shared proposal store in core;
background refresh scheduler with silent drift reconciliation, the
`/api/v1/local-models/*` read routes, kind-aware approve/reject, and
`local-models:{pool,proposal}` WS topics in the orchestrator; and the
`harness models {status,suggest,pool,proposals,approve,reject,install,evict,refresh}`
CLI. Opt-in via `localModels.enabled`; default-off behavior is unchanged.
