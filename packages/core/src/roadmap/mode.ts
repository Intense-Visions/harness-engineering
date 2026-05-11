/**
 * Roadmap storage mode.
 *
 * - `file-backed` — `docs/roadmap.md` is canonical (today's behavior).
 * - `file-less` — the configured external tracker is canonical; `docs/roadmap.md`
 *   must not exist. Activated explicitly via `roadmap.mode: "file-less"` in
 *   `harness.config.json` and validated by `validateRoadmapMode`.
 *
 * @see docs/changes/roadmap-tracker-only/proposal.md (Decision D5)
 */
export type RoadmapMode = 'file-backed' | 'file-less';

/**
 * Narrow shape this helper inspects. Accepts any object that may have a
 * `roadmap.mode` field; tolerates `undefined`, `null`, missing fields, and
 * malformed values without throwing. The full Zod schema lives in CLI
 * (`packages/cli/src/config/schema.ts`); this helper is intentionally
 * tolerant so it can be called from any layer (orchestrator, dashboard,
 * MCP tools) without re-validating.
 */
export interface RoadmapModeConfig {
  roadmap?: { mode?: string | undefined } | null | undefined;
}

/**
 * Returns the roadmap storage mode for a given Harness config.
 *
 * Returns `'file-backed'` (the default) when:
 *   - `config` is undefined or null
 *   - `config.roadmap` is absent or null
 *   - `config.roadmap.mode` is absent
 *   - `config.roadmap.mode` is the string `'file-backed'`
 *   - `config.roadmap.mode` is any other value (defensive — should never
 *     happen if the config has been Zod-validated, but tolerated here)
 *
 * Returns `'file-less'` only when `config.roadmap.mode === 'file-less'`.
 *
 * @param config - A Harness config (or any shape with optional `roadmap.mode`).
 * @returns `'file-backed'` or `'file-less'`.
 */
export function getRoadmapMode(config: RoadmapModeConfig | undefined | null): RoadmapMode {
  if (!config || !config.roadmap) return 'file-backed';
  const mode = config.roadmap.mode;
  return mode === 'file-less' ? 'file-less' : 'file-backed';
}
