---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
'@harness-engineering/cli': minor
---

Local backend runs the full harness workflow (gated). A `local`/`pi` dispatch now renders a backend-specific dispatch template (`harness.orchestrator.local.md`) that gives the tool-limited pi agent the workflow as bash `harness <gate>` calls instead of unavailable `/harness:*` slash commands. The orchestrator ENFORCES the verify + outcome-eval gates itself (`runLocalWorkflowGate` in `finalizeNormalCompletion`): a red verify or a high-confidence `NOT_SATISFIED` verdict routes through the existing `emitWorkerExit('error')` retry branch (re-prompt on retry, `needs-human` on budget exhaustion) so poor local output halts rather than ships. Template selection (`resolvePromptTemplate`) falls back to the default Claude template when the local file is absent, and the Claude/AMR completion path is unchanged (the gate is a no-op for non-local backends). A new config flag `agent.routing.workflowGates: local | primary` routes the local outcome-eval gate to a stronger provider (default local SEL; the AMR caller is unaffected). See ADRs 0070/0071.
