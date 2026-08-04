/**
 * Per-tool capability resolution for the `harness mcp list-capabilities`
 * adopter-audit command.
 *
 * PRIMARY SOURCE — the authoritative, evidence-based per-tool `capability`
 * DECLARATION carried on each `ToolDefinition` (authored in
 * `./tool-capability-declarations.ts`, merged onto the registry in
 * `server.ts`). Declared tools report their real read/write/exec scopes and
 * network flag, derived from each tool's ACTUAL behavior — not its name.
 *
 * FALLBACK — for any tool WITHOUT a declaration (e.g. a tool added later that
 * has not yet been annotated), scope is inferred from the tool NAME's verb
 * prefix and network from a small grounded allow-list. This heuristic is
 * deliberately kept and clearly labeled (`source: 'heuristic'`): it is
 * deterministic, ships with the compiled artifact, and keeps the command
 * useful for adopters even before a new tool is declared. Because every
 * currently-registered tool IS declared (enforced by the coverage test), the
 * fallback should be rare-to-never in practice.
 *
 * The heuristic can UNDER-report — a name like `run_ci_checks` reads as `exec`
 * but actually runs in-process; a `run_skill` reads as `exec` but only returns
 * SKILL.md. Those corrections are exactly what the declaration layer fixes; the
 * fallback exists only so an un-declared tool still gets a conservative answer.
 */
import type { ToolDefinition, ToolScope } from './tool-types.js';

export type { ToolScope };

/** Trust tag surfaced from the existing `trustedOutput` flag. */
export type ToolTrust = 'trusted' | 'untrusted';

/** Provenance of a capability record — declared data vs. name heuristic. */
export type CapabilitySource = 'declared' | 'heuristic';

export interface ToolCapability {
  name: string;
  /**
   * Privilege axes the tool exercises. From the tool's DECLARATION when present
   * (multiple allowed — a tool can read AND write); otherwise a single-element
   * array from the name heuristic. Sorted read < write < exec, deduped.
   */
  scopes: ToolScope[];
  /** True when the tool makes outbound network calls. */
  network: boolean;
  /** Trust tag from `trustedOutput` — `trusted` skips MCP output scanning. */
  trust: ToolTrust;
  /** Whether scopes/network came from the declaration or the name heuristic. */
  source: CapabilitySource;
}

/**
 * Verb prefixes that indicate the tool spawns subprocesses, dispatches
 * agents, or triggers remote jobs. Checked before write prefixes.
 * FALLBACK ONLY — used when a tool carries no capability declaration.
 */
const EXEC_PREFIXES: readonly string[] = ['run_', 'dispatch_', 'trigger_'];

/**
 * Verb prefixes that indicate the tool mutates files, local state, the graph,
 * the roadmap, or on-disk locks.
 * FALLBACK ONLY — used when a tool carries no capability declaration.
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
 * Network-touching tools for the FALLBACK path only. The authoritative network
 * flag now lives in each tool's declaration (`network: true`); this list is a
 * conservative default for a tool that has not yet been declared. Kept because
 * network access cannot be inferred from a tool name.
 */
export const NETWORK_TOOL_NAMES: readonly string[] = [
  'trigger_maintenance_job',
  'list_gateway_tokens',
  'subscribe_webhook',
  'manage_roadmap',
  'run_code_review',
];

/** Canonical ordering for scopes (least → most privileged) for stable output. */
const SCOPE_RANK: Record<ToolScope, number> = { read: 0, write: 1, exec: 2 };

/** Deduplicate + sort scopes into canonical read < write < exec order. */
function normalizeScopes(scopes: readonly ToolScope[]): ToolScope[] {
  return [...new Set(scopes)].sort((a, b) => SCOPE_RANK[a] - SCOPE_RANK[b]);
}

/**
 * Derive the heuristic scope for a tool name. Default is the least-privilege
 * `read`; escalates only on a matching verb prefix. Exec wins over write.
 * FALLBACK ONLY.
 */
export function deriveScope(name: string): ToolScope {
  if (EXEC_PREFIXES.some((prefix) => name.startsWith(prefix))) return 'exec';
  if (WRITE_PREFIXES.some((prefix) => name.startsWith(prefix))) return 'write';
  return 'read';
}

/**
 * Resolve the full capability record for a single tool definition. Prefers the
 * authored `capability` DECLARATION; falls back to the name heuristic only when
 * a tool carries no declaration.
 */
export function deriveToolCapability(def: ToolDefinition): ToolCapability {
  const trust: ToolTrust = def.trustedOutput === true ? 'trusted' : 'untrusted';
  if (def.capability) {
    return {
      name: def.name,
      scopes: normalizeScopes(def.capability.scopes),
      network: def.capability.network === true,
      trust,
      source: 'declared',
    };
  }
  return {
    name: def.name,
    scopes: [deriveScope(def.name)],
    network: NETWORK_TOOL_NAMES.includes(def.name),
    trust,
    source: 'heuristic',
  };
}

/**
 * Resolve capabilities for every tool, sorted by name for deterministic output.
 */
export function deriveToolCapabilities(definitions: readonly ToolDefinition[]): ToolCapability[] {
  return definitions.map(deriveToolCapability).sort((a, b) => a.name.localeCompare(b.name));
}
