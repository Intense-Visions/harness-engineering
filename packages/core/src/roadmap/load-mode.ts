import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRoadmapMode, type RoadmapMode } from './mode';

/**
 * Resolve the project's roadmap mode from `<projectRoot>/harness.config.json`.
 * Returns 'file-backed' on any error (missing file, invalid JSON, unreadable).
 *
 * D-P4-D: consolidates the four near-identical helpers across cli, dashboard,
 * and orchestrator. Per-request reads are kept (tracker setup cost dwarfs fs I/O).
 */
export function loadProjectRoadmapMode(projectRoot: string): RoadmapMode {
  try {
    const configPath = path.join(projectRoot, 'harness.config.json');
    if (!fs.existsSync(configPath)) return getRoadmapMode(null);
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Parameters<typeof getRoadmapMode>[0];
    return getRoadmapMode(parsed);
  } catch {
    return getRoadmapMode(null);
  }
}
