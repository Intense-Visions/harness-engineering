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

/** Default pipeline — structural then truncation. */
const DEFAULT_PIPELINE = new CompactionPipeline([
  new StructuralStrategy(),
  new TruncationStrategy(),
]);

/** Build the `<!-- packed: ... -->` header line. */
function buildHeader(orig: number, comp: number): string {
  const pct = orig > 0 ? Math.round((1 - comp / orig) * 100) : 0;
  return `<!-- packed: ${DEFAULT_PIPELINE.strategyNames.join('+')} | ${orig}→${comp} tokens (-${pct}%) -->`;
}

/** Compact text via pipeline (no header). */
function compactText(text: string): string {
  return DEFAULT_PIPELINE.apply(text, DEFAULT_TOKEN_BUDGET);
}

/** Compact all text items; prepend header to first only (header accounts for own tokens). */
function compactResult(result: ToolResult): ToolResult {
  const texts = result.content.filter((i) => i.type === 'text');
  const origTok = texts.reduce((s, i) => s + estimateTokens(i.text), 0);
  const packed = new Map<object, string>();
  for (const item of texts) packed.set(item, compactText(item.text));

  const compTok = [...packed.values()].reduce((s, t) => s + estimateTokens(t), 0);
  const hdrTok = estimateTokens(buildHeader(origTok, compTok));
  const header = buildHeader(origTok, compTok + hdrTok);

  let first = true;
  const content = result.content.map((item) => {
    if (item.type !== 'text') return item;
    const c = packed.get(item)!;
    if (first) {
      first = false;
      return { ...item, text: `${header}\n${c}` };
    }
    return { ...item, text: c };
  });
  return { ...result, content };
}

/** Wrap a tool handler with compaction. Fail-open; compact:false bypasses. */
export function wrapWithCompaction(toolName: string, handler: ToolHandler): ToolHandler {
  return async (input: Record<string, unknown>): Promise<ToolResult> => {
    // The compact tool already produces carefully budgeted output — skip to avoid double compaction
    if (toolName === 'compact') {
      return handler(input);
    }

    // Escape hatch: caller explicitly opts out (accept boolean or string)
    if (input.compact === false || input.compact === 'false') {
      return handler(input);
    }

    const result = await handler(input);

    try {
      return compactResult(result);
    } catch {
      // Fail-open: compaction error returns the original handler result unchanged
      return result;
    }
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
