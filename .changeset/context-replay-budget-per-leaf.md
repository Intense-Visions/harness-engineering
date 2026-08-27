---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/orchestrator': minor
---

Add the per-leaf context-replay budget enforcement primitive for the -fleet
family (#1524), with a live enforcement caller in the orchestrator dispatch
governor. A leaf's estimated context load is checked against a budget at
dispatch and fails loudly when over rather than silently spending.

- `@harness-engineering/core` (`fleet/context-budget`): `DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS`
  (200000), `resolveContextBudget`, `enforceLeafContextBudget`, `formatBudgetFailure`,
  `summarizeLeafSpend`, and the fail-loud consult helper `assertLeafWithinBudget`
  (throws `ContextBudgetExceededError` when over budget). Pure and offline.
- `@harness-engineering/types`: `LeafContextEstimate` / `ContextBudget` /
  `LeafContextSpend` / `LeafBudgetVerdict` shapes, plus `AgentContextBudgetConfig`
  and the optional `agent.contextBudget` field on `AgentConfig`.
- `@harness-engineering/orchestrator`: `assertIssueWithinContextBudget` consulted
  in the state machine's dispatch loop before each leaf is claimed; over-budget
  leaves emit a loud error effect and are skipped. Configured via
  `agent.contextBudget = { maxTokens, perFleet? }`. **Absent ⇒ unlimited** —
  dispatch behavior is byte-identical when unconfigured.
