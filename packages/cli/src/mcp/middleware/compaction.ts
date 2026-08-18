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
  spillIfNeeded,
} from '@harness-engineering/core';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

/**
 * Configuration for the compaction middleware.
 *
 * When `projectRoot` is provided, tool output large enough to be lossy-truncated
 * is first offloaded whole to disk via {@link spillIfNeeded}, and the compacted
 * (truncated) result carries a followup-readable locator so a later turn can
 * recover or search the full output instead of losing the truncated tail. When
 * `projectRoot` is omitted, spill is disabled and compaction behaves as before.
 */
export interface CompactionOptions {
  /** Project root under which spilled payloads are written (`.harness/.../spill/`). */
  projectRoot?: string;
  /** Byte threshold above which output is spilled to disk. Defaults to the spill module's resolved threshold. */
  spillThresholdBytes?: number;
}

/** Default pipeline — structural then truncation. */
const DEFAULT_PIPELINE = new CompactionPipeline([
  new StructuralStrategy(),
  new TruncationStrategy(),
]);

/** Lossless-only pipeline — structural compaction without truncation. */
const LOSSLESS_PIPELINE = new CompactionPipeline([new StructuralStrategy()]);

/** Build the `<!-- packed: ... -->` header line. */
function buildHeader(pipeline: CompactionPipeline, orig: number, comp: number): string {
  const pct = orig > 0 ? Math.round((1 - comp / orig) * 100) : 0;
  return `<!-- packed: ${pipeline.strategyNames.join('+')} | ${orig}→${comp} tokens (-${pct}%) -->`;
}

/** Compact text via the given pipeline (no header). */
function compactText(text: string, pipeline: CompactionPipeline, budget?: number): string {
  return pipeline.apply(text, budget);
}

/** Compact all text items; prepend header to first only (header accounts for own tokens). */
function compactResultWith(
  result: ToolResult,
  pipeline: CompactionPipeline,
  budget?: number
): ToolResult {
  const texts = result.content.filter((i) => i.type === 'text');
  const origTok = texts.reduce((s, i) => s + estimateTokens(i.text), 0);
  const packed = new Map<object, string>();
  for (const item of texts) packed.set(item, compactText(item.text, pipeline, budget));

  const compTok = [...packed.values()].reduce((s, t) => s + estimateTokens(t), 0);
  const hdrTok = estimateTokens(buildHeader(pipeline, origTok, compTok));
  const header = buildHeader(pipeline, origTok, compTok + hdrTok);

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

/**
 * Tools whose output must never be truncated — structural (lossless) compaction only.
 *
 * These return behavioral instructions, generated code/configs, structured state,
 * or user-facing decision trees that must arrive complete to function correctly.
 */
const LOSSLESS_ONLY_TOOLS = new Set([
  'run_skill', // Skill instructions the agent must follow completely
  'emit_interaction', // User decision trees — truncation breaks choice clarity
  'manage_state', // Project state JSON — truncation corrupts parsed schemas
  'code_unfold', // Complete symbol implementations by AST boundary
  'init_project', // Project scaffolding templates
  'generate_linter', // Generated ESLint rules — must be syntactically complete
  'validate_linter_config', // Linter validation — must be structurally complete
  'generate_agent_definitions', // Generated agent configs (YAML/JSON)
  'generate_slash_commands', // Generated command definitions
  'run_persona', // Persona execution results with generated artifacts
  'generate_persona_artifacts', // Generated configs, CI workflows
  'manage_roadmap', // Structured roadmap with cross-references and dependencies
]);

/** Concatenate all text items of a result — the full, pre-compaction payload. */
function joinResultText(result: ToolResult): string {
  return result.content
    .filter((i) => i.type === 'text')
    .map((i) => i.text)
    .join('\n');
}

/** Append a spill-recovery line (with the locator) to the first text item. */
function appendLocatorNotice(result: ToolResult, locator: string, bytes: number): ToolResult {
  const line =
    `\n[harness spill] full untruncated output (${bytes} bytes) preserved on disk — ` +
    `recover or grep the complete payload via locator: ${locator}`;
  let done = false;
  const content = result.content.map((item) => {
    if (done || item.type !== 'text') return item;
    done = true;
    return { ...item, text: `${item.text}${line}` };
  });
  return { ...result, content };
}

/**
 * Route a lossy-truncated result through the spill primitive.
 *
 * Over the spill threshold: the full pre-compaction output is written to disk
 * and the compacted result gets a followup-readable locator appended, so a later
 * turn can recover the truncated tail. Under threshold: the compacted result is
 * returned unchanged. Fail-open: any spill error yields the compacted result.
 */
async function spillLargeResult(
  toolName: string,
  original: ToolResult,
  compacted: ToolResult,
  options: CompactionOptions
): Promise<ToolResult> {
  if (!options.projectRoot) return compacted;

  const fullText = joinResultText(original);
  try {
    const spillOpts =
      options.spillThresholdBytes === undefined
        ? { label: toolName }
        : { label: toolName, thresholdBytes: options.spillThresholdBytes };
    const spill = await spillIfNeeded(options.projectRoot, fullText, spillOpts);
    if (spill.ok && spill.value.spilled) {
      return appendLocatorNotice(compacted, spill.value.locator, spill.value.bytes);
    }
  } catch {
    // Fail-open: spill failure must never break the tool response.
  }
  return compacted;
}

/** Wrap a tool handler with compaction. Fail-open; compact:false bypasses. */
export function wrapWithCompaction(
  toolName: string,
  handler: ToolHandler,
  options: CompactionOptions = {}
): ToolHandler {
  return async (input: Record<string, unknown>): Promise<ToolResult> => {
    // The compact tool already produces carefully budgeted output — skip to avoid double compaction.
    if (toolName === 'compact') {
      return handler(input);
    }

    // Escape hatch: caller explicitly opts out (accept boolean or string)
    if (input.compact === false || input.compact === 'false') {
      return handler(input);
    }

    const result = await handler(input);

    try {
      // run_skill returns behavioral instructions (SKILL.md) that the agent must follow
      // completely — truncation corrupts the workflow. Apply structural compaction only.
      // Lossless-only tools are never lossy-truncated, so there is nothing to spill.
      if (LOSSLESS_ONLY_TOOLS.has(toolName)) {
        return compactResultWith(result, LOSSLESS_PIPELINE);
      }
      const compacted = compactResultWith(result, DEFAULT_PIPELINE, DEFAULT_TOKEN_BUDGET);
      // Over-threshold output is truncated by the pipeline with no recovery path;
      // spill the full payload to disk and hand back a locator to recover it.
      return await spillLargeResult(toolName, result, compacted, options);
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
  handlers: Record<string, ToolHandler>,
  options: CompactionOptions = {}
): Record<string, ToolHandler> {
  const wrapped: Record<string, ToolHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = wrapWithCompaction(name, handler, options);
  }
  return wrapped;
}
