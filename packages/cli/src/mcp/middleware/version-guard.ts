/**
 * MCP-surface toolchain version guard.
 *
 * PR #1293 added a version-skew guard that refuses to produce findings when the
 * running CLI is sharply out of step with the workspace's declared
 * `toolchain.cliVersion`. It was wired as a commander `preAction` hook, so it
 * fires only on CLI invocations. MCP tools call the same check implementations
 * in-process through a different entry point (`bin/harness-mcp` → the server's
 * `CallToolRequest` handler), which never runs the commander hook — so a stale
 * `harness-mcp` shim reproduced the original incident unmitigated (#1301).
 *
 * This middleware closes that gap by applying the SAME decision logic
 * ({@link evaluateVersionGuard}) at the MCP dispatch boundary. It is NOT a second
 * copy of the ladder: the CLI hook and this wrapper both call the one shared
 * evaluator, so the two surfaces can never diverge on when to refuse. There is no
 * double-guarding — the two entry points are disjoint (an MCP call never passes
 * through commander, and a CLI action never passes through this map), so a given
 * findings request is evaluated exactly once, on whichever surface it arrived.
 *
 * Enforcement is adapted to the surface: a refusal returns an `isError` result
 * (the MCP analogue of the CLI's exit 3) and the underlying tool never runs; a
 * warning proceeds and prepends the notice so the session still sees it. The
 * `HARNESS_NO_VERSION_GUARD` escape hatch downgrades a refusal to a warning here
 * exactly as it does on the CLI.
 *
 * Fail-open: any error while deciding returns the raw handler unchanged — a
 * broken guard must never break the MCP server, mirroring the CLI hook's
 * try/catch.
 */

import { CLI_VERSION } from '../../version.js';
import { envEnabled } from '../../utils/env-flag.js';
import {
  GUARDED_MCP_TOOLS,
  evaluateVersionGuard,
  findProjectRoot,
  resolveExpectedVersion,
} from '../../utils/version-guard.js';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type ToolHandler = (input: Record<string, unknown>) => Promise<ToolResult>;

/** Configuration for the MCP version-guard middleware. */
export interface VersionGuardMiddlewareOptions {
  /**
   * The server's resolved project root. Used to resolve the expected CLI version
   * when a tool call carries no `path` argument of its own.
   */
  projectRoot: string;
}

/** Prepend the version-skew notice as a leading text item. */
function prependNotice(result: ToolResult, notice: string): ToolResult {
  return {
    ...result,
    content: [{ type: 'text', text: notice }, ...result.content],
  };
}

/**
 * Wrap one findings-producing MCP tool handler with the version-skew guard.
 *
 * The workspace evaluated is the one the call targets: findings tools take a
 * `path` argument naming the project to scan, so its `harness.config.json`
 * pin is what governs — falling back to the server's `projectRoot` when the
 * call carries no `path`. This mirrors the CLI guard, which resolves the pin
 * from the directory the command operates on.
 */
export function wrapWithVersionGuard(
  toolName: string,
  handler: ToolHandler,
  options: VersionGuardMiddlewareOptions
): ToolHandler {
  if (!GUARDED_MCP_TOOLS.has(toolName)) return handler;

  return async (input: Record<string, unknown>): Promise<ToolResult> => {
    let result;
    try {
      const callPath = typeof input['path'] === 'string' ? (input['path'] as string) : undefined;
      const projectRoot = findProjectRoot(callPath ?? options.projectRoot);
      result = evaluateVersionGuard(CLI_VERSION, resolveExpectedVersion(projectRoot), {
        bypass: envEnabled(process.env['HARNESS_NO_VERSION_GUARD']),
        commandPath: toolName,
      });
    } catch {
      // Fail-open: a broken guard must never break the tool. Deciding not to
      // scan is deliberate; crashing on the way to deciding is not.
      return handler(input);
    }

    if (result.status === 'refuse') {
      // The MCP analogue of the CLI's exit 3: the tool examined nothing, so the
      // caller must not mistake this for a completed scan. The handler is never
      // invoked.
      return { content: [{ type: 'text', text: result.message }], isError: true };
    }

    if (result.status === 'warn') {
      const out = await handler(input);
      return prependNotice(out, result.message);
    }

    // ok / unknown — proceed untouched.
    return handler(input);
  };
}

/**
 * Wrap every findings-producing handler in a handlers map with the version
 * guard. Non-findings handlers are returned unwrapped (byte-identical no-op).
 */
export function applyVersionGuard(
  handlers: Record<string, ToolHandler>,
  options: VersionGuardMiddlewareOptions
): Record<string, ToolHandler> {
  const wrapped: Record<string, ToolHandler> = {};
  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = wrapWithVersionGuard(name, handler, options);
  }
  return wrapped;
}
