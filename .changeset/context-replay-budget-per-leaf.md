---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
---

Add the per-leaf context-replay budget enforcement primitive for the -fleet
family (#1524). A leaf's declared/estimated context load is checked against a
budget at dispatch and fails loudly when over rather than silently spending.
Ships `DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS` (200000) with a config override,
`resolveContextBudget` / `enforceLeafContextBudget` / `formatBudgetFailure` /
`summarizeLeafSpend` in `@harness-engineering/core` (`fleet/context-budget`),
and the `LeafContextEstimate` / `ContextBudget` / `LeafContextSpend` /
`LeafBudgetVerdict` shapes in `@harness-engineering/types`. Pure and offline.
