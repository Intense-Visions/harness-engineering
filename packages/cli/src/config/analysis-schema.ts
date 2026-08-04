import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

/**
 * Schema for cross-cutting analysis configuration.
 *
 * `analysis.exclude` is a project-wide list of glob patterns (minimatch
 * syntax) excluded from every analysis scanner — entropy/dead-code detection,
 * graph code ingestion, the security scan file walk, and the CI doc-coverage
 * check. It is applied ON TOP of each scanner's own excludes (e.g.
 * `entropy.excludePatterns`, `security.exclude`, `ingest.excludePatterns`),
 * so a repo can declare vendored or generated paths once instead of
 * repeating them per tool. Direct precedent: `design.exclude` for the
 * design-token drift linter.
 *
 * Lives in its own file (mirroring `ingest-schema.ts`) so hot paths can
 * validate the `analysis` block without dragging in the full
 * HarnessConfigSchema and its transitive imports.
 */
export const AnalysisConfigSchema = z.object({
  /** Glob patterns (minimatch) excluded from all analysis scanners. */
  exclude: z.array(z.string().min(1)).default([]),
});

export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;

/**
 * Best-effort load of `analysis.exclude` from `<projectPath>/harness.config.json`.
 *
 * Returns `[]` when the config file is missing, malformed, or the `analysis`
 * block fails validation — analysis commands must keep working on projects
 * that have not run `harness init`, and each scanner already has sane
 * built-in default excludes (see `DEFAULT_SKIP_DIRS` in
 * `@harness-engineering/graph`).
 */
export function loadAnalysisExclude(projectPath: string): string[] {
  const configPath = path.join(projectPath, 'harness.config.json');
  if (!fs.existsSync(configPath)) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return [];
  }

  const analysisRaw = (raw as { analysis?: unknown } | null | undefined)?.analysis;
  if (analysisRaw === undefined) return [];
  const parsed = AnalysisConfigSchema.safeParse(analysisRaw);
  if (!parsed.success) return [];
  return parsed.data.exclude;
}

/**
 * Schema fragment for the `design.exclude` glob list (drift-linter scoping).
 * Kept here — alongside `analysis.exclude` — so the drift runner can load it
 * without importing the full `HarnessConfigSchema` and its transitive deps.
 * Mirrors the `DesignConfigSchema.exclude` field shape.
 */
const DesignExcludeSchema = z.object({
  exclude: z.array(z.string().min(1)).default([]),
});

/**
 * Best-effort load of `design.exclude` from `<projectPath>/harness.config.json`.
 *
 * Returns `[]` on any miss (no file, malformed JSON, or a `design` block that
 * fails validation) so the drift linter keeps working on un-configured
 * projects. Read inside the drift runner so every caller (validate,
 * check-design, align, design-pipeline, MCP) honors `design.exclude` uniformly
 * — the same pattern `loadAnalysisExclude` uses for the project-wide list.
 */
export function loadDesignExclude(projectPath: string): string[] {
  const configPath = path.join(projectPath, 'harness.config.json');
  if (!fs.existsSync(configPath)) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return [];
  }

  const designRaw = (raw as { design?: unknown } | null | undefined)?.design;
  if (designRaw === undefined || designRaw === null || typeof designRaw !== 'object') return [];
  const parsed = DesignExcludeSchema.safeParse(designRaw);
  if (!parsed.success) return [];
  return parsed.data.exclude;
}
