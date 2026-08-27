/**
 * Manual-session context-budget middleware.
 *
 * Extends the per-leaf context-replay budget (#1524) — enforced today only on the
 * orchestrator dispatch path — onto the harness MCP server request path, the
 * universal surface every manual AI session (Claude Code / Cursor / Codex /
 * Gemini) passes through (#1594). When an adopter declares a budget, each tool
 * response is measured against it and, when over, a loud steer notice is injected
 * that points the session at graph-scoped retrieval (`code_outline` /
 * `code_unfold` / `find_context_for`).
 *
 * Reuses the ONE shared budget primitive — `evaluateSessionContextBudget` in
 * `@harness-engineering/core` delegates the over/under decision to the same
 * `enforceLeafContextBudget` the orchestrator governor calls — so manual sessions
 * and orchestrator dispatch can never diverge on what "over budget" means.
 *
 * Authority is WARN, not reject: a human mid-session is nudged, never hard-failed.
 *
 * Byte-identical when unconfigured: with no `mcp.contextBudget.maxTokens` set the
 * handler is returned UNWRAPPED, so MCP behavior — and cost — is exactly as before.
 * Fail-open: any error in the check returns the raw handler result unchanged.
 */

import { estimateTokens, evaluateSessionContextBudget } from '@harness-engineering/core';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

/** Configuration for the context-budget middleware. */
export interface ContextBudgetMiddlewareOptions {
  /**
   * The declared per-response budget in tokens (`mcp.contextBudget.maxTokens`).
   * When `undefined` the middleware is a no-op and handlers are returned
   * unwrapped — byte-identical to pre-budget behavior.
   */
  maxTokens?: number | undefined;
}

/** Concatenate all text items of a result — the payload the session pays for. */
function joinResultText(result: ToolResult): string {
  return result.content
    .filter((i) => i.type === 'text')
    .map((i) => i.text)
    .join('\n');
}

/** Append the over-budget steer notice as a trailing text item. */
function appendNotice(result: ToolResult, notice: string): ToolResult {
  return {
    ...result,
    content: [...result.content, { type: 'text', text: `\n---\n${notice}` }],
  };
}

/**
 * Wrap a tool handler with the manual-session context-budget check.
 *
 * When `maxTokens` is not a positive number the handler is returned UNWRAPPED
 * (byte-identical no-op). Otherwise the wrapped handler runs the tool, estimates
 * the response's token load, consults the shared budget primitive, and appends a
 * steer notice when over budget.
 */
export function wrapWithContextBudget(
  toolName: string,
  handler: ToolHandler,
  options: ContextBudgetMiddlewareOptions = {}
): ToolHandler {
  const maxTokens = options.maxTokens;
  // Unconfigured (or non-positive) ⇒ no enforcement, no wrapping: byte-identical.
  if (typeof maxTokens !== 'number' || !(maxTokens > 0)) {
    return handler;
  }
  return async (input: Record<string, unknown>): Promise<ToolResult> => {
    const result = await handler(input);
    try {
      const estimatedTokens = estimateTokens(joinResultText(result));
      const signal = evaluateSessionContextBudget(toolName, estimatedTokens, { maxTokens });
      if (!signal.ok) {
        return appendNotice(result, signal.notice);
      }
    } catch {
      // Fail-open: a budget-check error must never break the tool response.
    }
    return result;
  };
}

/**
 * Wrap all tool handlers in a handlers map with the context-budget middleware.
 * With no budget configured this returns the same handlers unwrapped.
 */
export function applyContextBudget(
  handlers: Record<string, ToolHandler>,
  options: ContextBudgetMiddlewareOptions = {}
): Record<string, ToolHandler> {
  if (typeof options.maxTokens !== 'number' || !(options.maxTokens > 0)) {
    return handlers;
  }
  const wrapped: Record<string, ToolHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = wrapWithContextBudget(name, handler, options);
  }
  return wrapped;
}
