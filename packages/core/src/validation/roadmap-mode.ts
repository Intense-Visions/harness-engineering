import * as fs from 'node:fs';
import * as path from 'node:path';
import { Ok, Err, type Result } from '../shared/result';
import { createError } from '../shared/errors';
import type { ConfigError } from './types';
import { getRoadmapMode, type RoadmapModeConfig } from '../roadmap/mode';

/**
 * Shape inspected by validateRoadmapMode. A superset of RoadmapModeConfig
 * because we also need to detect tracker presence.
 */
export interface RoadmapModeValidationConfig extends RoadmapModeConfig {
  roadmap?: {
    mode?: string;
    tracker?: unknown;
  } | null;
}

/**
 * Validates the cross-cutting roadmap-mode invariants that Zod cannot express:
 *
 * Rule A: when `roadmap.mode === "file-less"`, `roadmap.tracker` MUST be configured.
 * Rule B: when `roadmap.mode === "file-less"`, `docs/roadmap.md` MUST NOT exist.
 *
 * Rule A is checked first (structural error; file presence is recoverable).
 *
 * @param config - The loaded Harness config (post-Zod-parse).
 * @param projectRoot - Absolute path to the project root (for `docs/roadmap.md` lookup).
 * @returns Ok(undefined) if all rules pass; Err(ConfigError) on the first violation.
 *
 * @see docs/changes/roadmap-tracker-only/proposal.md (§Config schema)
 */
export function validateRoadmapMode(
  config: RoadmapModeValidationConfig,
  projectRoot: string
): Result<void, ConfigError> {
  const mode = getRoadmapMode(config);
  if (mode === 'file-backed') return Ok(undefined);

  // mode === 'file-less'

  // Rule A: tracker must be configured.
  const tracker = config.roadmap?.tracker;
  if (!tracker || typeof tracker !== 'object') {
    return Err(
      createError<ConfigError>(
        'ROADMAP_MODE_MISSING_TRACKER',
        'roadmap.mode is "file-less" but roadmap.tracker is not configured. ' +
          'File-less mode requires an external tracker as the source of truth.',
        { mode },
        [
          'Configure roadmap.tracker in harness.config.json (e.g., kind: "github", repo: "owner/name").',
          'Or set roadmap.mode to "file-backed" if you want to keep using docs/roadmap.md.',
        ]
      )
    );
  }

  // Rule B: docs/roadmap.md must not exist.
  const roadmapPath = path.join(projectRoot, 'docs', 'roadmap.md');
  if (fs.existsSync(roadmapPath)) {
    return Err(
      createError<ConfigError>(
        'ROADMAP_MODE_FILE_PRESENT',
        'roadmap.mode is "file-less" but docs/roadmap.md still exists. ' +
          'In file-less mode the tracker is canonical; the markdown file must be migrated. ' +
          'Run `harness roadmap migrate --to=file-less` to migrate features into the tracker.',
        { mode, roadmapPath },
        [
          'Run `harness roadmap migrate --to=file-less` to migrate features into the tracker.',
          'Or set roadmap.mode to "file-backed" if you want to keep docs/roadmap.md.',
        ]
      )
    );
  }

  return Ok(undefined);
}
