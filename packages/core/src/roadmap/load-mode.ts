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

/**
 * Roadmap storage layout — orthogonal to {@link RoadmapMode} (which selects the
 * canonical source: file-backed vs file-less). Storage layout selects how a
 * file-backed roadmap is physically stored:
 *   - `monolith` — a single aggregate file under `docs/` is canonical (legacy).
 *   - `sharded`  — per-row shards under `docs/roadmap.d/` are canonical; the
 *     aggregate is a generated `merge=ours` view (spec Decisions D3/D4/R).
 *
 * Auto-detected by the presence of `docs/roadmap.d/`. This is the single
 * detection authority; `store/factory.ts` delegates here so the formal mode and
 * the store backend can never disagree.
 *
 * @see docs/changes/roadmap-shard-store/proposal.md (§Mode detection)
 */
export type RoadmapStorageMode = 'monolith' | 'sharded';

/**
 * Detect a project's roadmap storage layout from the filesystem. Returns
 * `sharded` when the `docs/roadmap.d/` shard directory is present, else
 * `monolith`. The `exists` probe is injectable for unit testing.
 */
export function detectRoadmapStorageMode(
  projectRoot: string,
  exists: (target: string) => boolean = (target) => fs.existsSync(target)
): RoadmapStorageMode {
  // Normalize separators to '/' so the injectable `exists` probe receives a
  // consistent path on every OS (Node's fs accepts forward slashes on Windows).
  const shardDir = path.join(projectRoot, 'docs', 'roadmap.d').replaceAll('\\', '/');
  return exists(shardDir) ? 'sharded' : 'monolith';
}
