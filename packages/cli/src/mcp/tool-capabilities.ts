/**
 * Per-tool capability derivation for the `harness mcp list-capabilities`
 * adopter-audit command.
 *
 * IMPORTANT — this is a HEURISTIC, not an authoritative declaration.
 *
 * The MCP registry does not (yet) carry a per-tool capability declaration;
 * the only per-tool metadata that exists today is `name`, `description`, and
 * the `trustedOutput` trust flag (see `./tool-types.ts`). Roadmap #558 adds a
 * real per-tool capability field — until then this module derives a
 * conservative read/write/exec scope purely from the tool NAME's verb prefix.
 *
 * Deriving from the name (rather than scanning each handler's source for
 * `fs`-write / `child_process` / `fetch` imports) is a deliberate choice: the
 * command must work for ADOPTERS running the published CLI, where only the
 * compiled registry is available at runtime — the TypeScript source is not.
 * The naming-convention signal is deterministic, testable, and travels with
 * the shipped artifact.
 *
 * Known limitations (documented in docs/changes/mcp-list-capabilities/proposal.md):
 *  - Scope can UNDER-report: a few `read`-named tools shell out internally
 *    (e.g. `assess_project`, `design_craft`) but are classified `read`.
 *  - The scope is the single highest-privilege axis inferred from the verb,
 *    not an exhaustive permission set.
 * The authoritative fix is the per-tool capability declaration of #558.
 */
import type { ToolDefinition } from './tool-types.js';

/** Highest-privilege axis inferred for a tool. */
export type ToolScope = 'read' | 'write' | 'exec';

/** Trust tag surfaced from the existing `trustedOutput` flag. */
export type ToolTrust = 'trusted' | 'untrusted';

export interface ToolCapability {
  name: string;
  /** Heuristic scope derived from the tool-name verb prefix. */
  scope: ToolScope;
  /** True when the tool makes outbound network calls (grounded allow-list). */
  network: boolean;
  /** Trust tag from `trustedOutput` — `trusted` skips MCP output scanning. */
  trust: ToolTrust;
}

/**
 * Verb prefixes that indicate the tool spawns subprocesses, dispatches
 * agents, or triggers remote jobs. Checked before write prefixes.
 */
const EXEC_PREFIXES: readonly string[] = ['run_', 'dispatch_', 'trigger_'];

/**
 * Verb prefixes that indicate the tool mutates files, local state, the graph,
 * the roadmap, or on-disk locks.
 */
const WRITE_PREFIXES: readonly string[] = [
  'write_',
  'edit_',
  'create_',
  'generate_',
  'init_',
  'manage_',
  'emit_',
  'ingest_',
  'update_',
  'add_',
  'seed_',
  'acquire_',
  'release_',
  'align_',
  'subscribe_',
];

/**
 * Tools that make outbound network calls. Grounded, not guessed: an import
 * scan of `packages/cli/src/mcp/tools/` shows only the Gateway API bridge
 * (`gateway-tools.ts`) and the webhook subscription (`webhook-tools.ts`) reach
 * the network. Kept as an explicit constant because — unlike scope — network
 * access cannot be inferred from the tool name (`list_gateway_tokens` reads
 * like a local list but is a remote call). New network-touching tools must be
 * added here; #558's capability declaration removes the need.
 */
export const NETWORK_TOOL_NAMES: readonly string[] = [
  'trigger_maintenance_job',
  'list_gateway_tokens',
  'subscribe_webhook',
];

/**
 * Derive the heuristic scope for a tool name. Default is the least-privilege
 * `read`; escalates only on a matching verb prefix. Exec wins over write.
 */
export function deriveScope(name: string): ToolScope {
  if (EXEC_PREFIXES.some((prefix) => name.startsWith(prefix))) return 'exec';
  if (WRITE_PREFIXES.some((prefix) => name.startsWith(prefix))) return 'write';
  return 'read';
}

/** Derive the full capability record for a single tool definition. */
export function deriveToolCapability(def: ToolDefinition): ToolCapability {
  return {
    name: def.name,
    scope: deriveScope(def.name),
    network: NETWORK_TOOL_NAMES.includes(def.name),
    trust: def.trustedOutput === true ? 'trusted' : 'untrusted',
  };
}

/**
 * Derive capabilities for every tool, sorted by name for deterministic output.
 */
export function deriveToolCapabilities(definitions: readonly ToolDefinition[]): ToolCapability[] {
  return definitions.map(deriveToolCapability).sort((a, b) => a.name.localeCompare(b.name));
}
