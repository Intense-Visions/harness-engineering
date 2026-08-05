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

/**
 * The privilege axes a tool can exercise against the host:
 *  - `read`  — observes workspace / graph / config / session state only.
 *  - `write` — mutates persistent state: files, config, the graph/DB, the
 *    roadmap, on-disk locks, generated artifacts (skills, agents, personas).
 *  - `exec`  — spawns a subprocess, shells out (git/lint/CLI), or dispatches
 *    an agent/skill runner.
 *
 * A single tool may exercise several axes at once (e.g. `add_component`
 * scaffolds files AND spawns `npx harness add`, so it declares
 * `['write', 'exec']`). This is why `scopes` is an array, not a single value.
 */
export type ToolScope = 'read' | 'write' | 'exec';

/**
 * Per-tool capability DECLARATION — the authoritative, evidence-based statement
 * of what a tool can do, authored alongside the tool and compiled into the
 * registry. It is read by `harness mcp list-capabilities` (the Trust & Security
 * adopter-audit surface) in place of the tool-name heuristic.
 *
 * Because this is authored data baked into the shipped artifact, the runtime
 * reads DECLARED values — it does not (and cannot) scan TypeScript source that
 * is absent from the published CLI. Declarations are verified against each
 * tool's actual behavior (fs writes, `child_process`/`execFile`/`spawn`,
 * outbound `fetch`/HTTP, graph/DB writes), not inferred from the name.
 */
export interface ToolCapabilityDeclaration {
  /** Privilege axes this tool exercises. At least one; multiple allowed. */
  scopes: ToolScope[];
  /**
   * True when the tool makes outbound network calls (Gateway API, webhook
   * registration, external issue-tracker sync, PR comment posting, …).
   * A separate axis from `scopes` because network reach is orthogonal to
   * read/write/exec — a read-only tool (`list_gateway_tokens`) can still be
   * a remote call. Defaults to `false` when omitted.
   */
  network?: boolean;
}

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** When true, output scanning is skipped for this tool (internal content, not external). */
  trustedOutput?: boolean;
  /**
   * Authoritative capability declaration for the adopter-audit surface. When
   * present, `harness mcp list-capabilities` reports these DECLARED scopes /
   * network flag instead of the tool-name heuristic. Injected onto every
   * registered definition from `./tool-capability-declarations.ts` at
   * registry-assembly time (see `server.ts`).
   */
  capability?: ToolCapabilityDeclaration;
};
