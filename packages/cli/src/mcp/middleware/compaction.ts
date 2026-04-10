/**
 * Compaction Middleware
 *
 * Wraps MCP tool handlers at registration time to apply lossless compaction
 * (structural pass + prioritized truncation) to all tool responses.
 *
 * Escape hatch: when the incoming tool arguments contain `compact: false`,
 * the middleware is bypassed entirely and the raw handler output is returned.
 *
 * Default pipeline: StructuralStrategy → TruncationStrategy (4000-token budget)
 * Fail-open: if the middleware itself throws, the original handler error propagates.
 */

import {
  CompactionPipeline,
  StructuralStrategy,
  TruncationStrategy,
  DEFAULT_TOKEN_BUDGET,
  estimateTokens,
} from '@harness-engineering/core';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

/** Shared default pipeline — structural then truncation, both lossless. */
const DEFAULT_PIPELINE = new CompactionPipeline([
  new StructuralStrategy(),
  new TruncationStrategy(),
]);

/**
 * Build the `<!-- packed: ... -->` header line.
 */
function buildHeader(originalTokens: number, compactedTokens: number): string {
  const reductionPct =
    originalTokens > 0 ? Math.round((1 - compactedTokens / originalTokens) * 100) : 0;
  return `<!-- packed: structural+truncate | ${originalTokens}→${compactedTokens} tokens (-${reductionPct}%) -->`;
}

/**
 * Compact a single text content item.
 * Returns the compacted text with a packed header prepended.
 */
function compactText(text: string): string {
  const originalTokens = estimateTokens(text);
  const compacted = DEFAULT_PIPELINE.apply(text, DEFAULT_TOKEN_BUDGET);
  const compactedTokens = estimateTokens(compacted);
  const header = buildHeader(originalTokens, compactedTokens);
  return `${header}\n${compacted}`;
}

/**
 * Wrap a single MCP tool handler with compaction middleware.
 *
 * The returned handler:
 * 1. If `input.compact === false`, bypasses middleware and returns raw output.
 * 2. Calls the original handler.
 * 3. For each content item with type === 'text', applies the default pipeline.
 * 4. Prepends the `<!-- packed: ... -->` header to the first text item.
 * 5. Fail-open: if the handler throws, the error propagates unchanged.
 */
export function wrapWithCompaction(toolName: string, handler: ToolHandler): ToolHandler {
  return async (input: Record<string, unknown>): Promise<ToolResult> => {
    // Escape hatch: caller explicitly opts out
    if (input.compact === false) {
      return handler(input);
    }

    const result = await handler(input);

    // Apply compaction to each text content item
    const compactedContent = result.content.map((item) => {
      if (item.type !== 'text') return item;
      return { ...item, text: compactText(item.text) };
    });

    return { ...result, content: compactedContent };
  };
}

/**
 * Wrap all tool handlers in a handlers map with compaction middleware.
 */
export function applyCompaction(
  handlers: Record<string, ToolHandler>
): Record<string, ToolHandler> {
  const wrapped: Record<string, ToolHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = wrapWithCompaction(name, handler);
  }
  return wrapped;
}
