# Plan — Context-replay budget must reach manual AI sessions (#1594)

## Problem

The per-leaf context-replay budget (#1524, PR #1586, merged) enforces a declared
context budget with fail-loud behavior — but ONLY on the orchestrator dispatch
path (`packages/orchestrator/src/core/state-machine.ts` → `context-budget-governor.ts`).
The cost that motivated it — cache-read tokens at ~298x output across 698 sessions —
is overwhelmingly **manual** AI-session usage (a human running Claude Code / Cursor /
Codex / Gemini against the harness MCP server). So the budget misses the very
sessions it was built for.

## Approach (operator-confirmed)

Extend #1524's budget primitive onto the **harness MCP server request path** — the
universal surface every manual AI session passes through — reusing the existing
manual-session context machinery rather than forking a parallel budget.

### 1. Core — one shared budget primitive (no fork)

`@harness-engineering/core` `fleet/context-budget`:

- Add `evaluateSessionContextBudget(item, estimatedTokens, budget, options?)` →
  `SessionBudgetSignal`. It **delegates the over/under decision to the existing
  `enforceLeafContextBudget`** (the ONE comparison primitive orchestrator dispatch
  also uses), so the two surfaces can never diverge on what "over budget" means.
  The difference is presentation + authority: a manual session **WARNs** (injects a
  steer) rather than reject-at-dispatch, because a human mid-session must not be
  hard-failed. The notice steers toward graph-scoped retrieval
  (`code_outline` / `code_unfold` / `find_context_for`).

### 2. CLI MCP path — the live wiring

- New middleware `packages/cli/src/mcp/middleware/context-budget.ts`:
  `wrapWithContextBudget(toolName, handler, { maxTokens })` /
  `applyContextBudget(handlers, { maxTokens })`.
  - When `maxTokens` is `undefined` (unconfigured) it returns the handler
    **unwrapped** — byte-identical, zero overhead.
  - When configured: after the handler runs, estimate the response's token load
    (reusing core `estimateTokens`, the same estimator the compaction middleware
    uses), call `evaluateSessionContextBudget`, and on over-budget **append** the
    steer notice to the response. Fail-open: any error returns the raw result.
- Wire it in `packages/cli/src/mcp/server.ts` `createHarnessServer`, **after**
  compaction (so the budget measures the post-compaction size the session actually
  pays for), reading the budget from `mcp.contextBudget.maxTokens` in
  `harness.config.json`.

### 3. Config surface

Add `mcp.contextBudget.maxTokens` (positive int, optional) to
`HarnessConfigSchema`. Absent ⇒ no-op.

## Files

- `packages/core/src/fleet/context-budget/index.ts` — add `evaluateSessionContextBudget` + `SessionBudgetSignal`.
- `packages/core/src/fleet/context-budget/index.test.ts` — unit tests for the new helper.
- `packages/cli/src/mcp/middleware/context-budget.ts` — new middleware (live wiring).
- `packages/cli/src/mcp/middleware/context-budget.test.ts` — WIRED test: over-budget warns; unconfigured byte-identical.
- `packages/cli/src/mcp/server.ts` — resolve budget from config + apply middleware after compaction.
- `packages/cli/src/config/schema.ts` — `mcp.contextBudget` config.
- `docs/reference/*` — regenerated.

## Rate-budget audit (#1532)

`applyResourceBudgets` is a **fan-out concurrency governor** applied at orchestrator
startup. A manual AI session is not a fan-out — it issues ad-hoc tool calls with no
concurrency envelope to pace — so the rate _budget_ has no manual-session surface to
apply to. Its paired fail-loud-on-truncation guard in `GitHubHttp` already fires
anywhere, including manual sessions that hit GitHub-backed tools. Conclusion: no code
needed on the MCP path for the rate budget; documented as a deliberate scope decision,
not a deferred slice.

## Verification (WIRED)

A reviewer traces: live MCP request → `dispatchTool` → `applyContextBudget`-wrapped
handler → `evaluateSessionContextBudget` (core) → notice injected when over the
configured `mcp.contextBudget.maxTokens`. The middleware test proves the over-budget
warn and the unconfigured byte-identical no-op.
