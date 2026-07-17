import type { IntegrationDef } from './types';

/**
 * A single MCP server as it is actually configured in a project's `.mcp.json`.
 *
 * The reconcile core only needs the server's `name` (the key under
 * `mcpServers`) to diff against the registry. This mirrors what `list.ts`
 * reads from `readMcpConfig(...).mcpServers`.
 */
export interface ConfiguredServer {
  /** The MCP server name (the key under `mcpServers` in `.mcp.json`). */
  name: string;
}

/**
 * The reconcile plan produced by {@link reconcileIntegrations}.
 *
 * - `toAdd` — registry entries whose `name` is NOT currently configured, in
 *   registry order (deterministic).
 * - `deprecated` — configured servers whose `name` is NOT in the registry, in
 *   configured order (deterministic).
 */
export interface ReconcilePlan {
  toAdd: IntegrationDef[];
  deprecated: ConfiguredServer[];
}

/**
 * Pure reconcile core (D4). Diffs a project's configured MCP servers against
 * the current catalog with NO I/O and deterministic ordering.
 *
 * @param configured The project's configured MCP servers (from `.mcp.json`).
 * @param registry   The suggested catalog (`INTEGRATION_REGISTRY`).
 * @returns The reconcile plan: `{ toAdd, deprecated }`.
 */
export function reconcileIntegrations(
  configured: readonly ConfiguredServer[],
  registry: readonly IntegrationDef[]
): ReconcilePlan {
  const configuredNames = new Set(configured.map((s) => s.name));
  const registryNames = new Set(registry.map((d) => d.name));

  // Registry order for adds.
  const toAdd = registry.filter((d) => !configuredNames.has(d.name)).map((d) => ({ ...d }));

  // Configured order for deprecated.
  const deprecated = configured.filter((s) => !registryNames.has(s.name)).map((s) => ({ ...s }));

  return { toAdd, deprecated };
}
