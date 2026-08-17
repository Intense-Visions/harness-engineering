---
'@harness-engineering/orchestrator': patch
---

chore(cleanup): remove dead orchestrator/workflow export. Un-export the intra-file-only `stagedWorkflowRoutingIssues` helper in `workflow/config.ts` (it is called only by `validateWorkflowConfig` within the same file; its stale "exported for unit testing" note is corrected since no test imports it directly). Pure dead-code removal; no behavior change.
