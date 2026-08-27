---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Extend the context-replay budget (#1524) onto the harness MCP server path so it
reaches manual AI sessions, not just orchestrator dispatch (#1594). Manual
sessions (Claude Code / Cursor / Codex / Gemini running against the harness MCP
server) are where the cache-read replay cost that motivated the budget actually
lives, and until now the budget missed them entirely.

- `@harness-engineering/core` (`fleet/context-budget`): `evaluateSessionContextBudget`
  and the `SessionBudgetSignal` shape. It **delegates the over/under decision to the
  existing `enforceLeafContextBudget`** — ONE shared budget implementation for
  orchestrator dispatch and manual sessions — but manual sessions WARN (return a
  non-throwing signal carrying a steer notice) rather than reject-at-dispatch.
- `@harness-engineering/cli`: new MCP middleware `applyContextBudget` /
  `wrapWithContextBudget`, wired into `createHarnessServer` after compaction. When
  `mcp.contextBudget.maxTokens` is configured, an over-budget tool response gets a
  loud steer notice appended pointing the session at graph-scoped retrieval
  (`code_outline` / `code_unfold` / `find_context_for`). **Absent ⇒ handlers are
  returned unwrapped** — MCP behavior is byte-identical when unconfigured.
