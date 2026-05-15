/**
 * Shared MCP tool type definitions.
 *
 * Lives in its own module (rather than `server.ts`) so that tool-definition
 * files like `./tools/gateway-tools.ts` and the tier-allowlist in
 * `./tool-tiers.ts` can import `ToolDefinition` without creating a circular
 * dependency back to `server.ts` (which in turn imports each tool's
 * definition object). Flagged by `harness check-deps` at the end of
 * Phase 2 — fix landed in the Task 14 exit-gate sweep.
 */
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** When true, output scanning is skipped for this tool (internal content, not external). */
  trustedOutput?: boolean;
};
