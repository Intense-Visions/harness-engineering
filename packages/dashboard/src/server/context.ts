import { join } from 'node:path';
import { DataCache } from './cache';
import { GatherCache } from './gather-cache';
import type { SSEContext, SSEManager } from './sse';
import { DEFAULT_POLL_INTERVAL_MS } from '../shared/constants';

export interface ServerContext extends SSEContext {
  /** Resolved absolute path to docs/roadmap-charts.md */
  chartsPath: string;
  /** Shared in-memory cache (60s TTL) */
  cache: DataCache;
  /** Shared SSE manager instance */
  sseManager: SSEManager;
  /** Cache for expensive on-demand gatherers */
  gatherCache: GatherCache;
}

/** Resolve the project root from overrides or environment. */
function resolveProjectPath(overrides: Partial<ServerContext>): string {
  return overrides.projectPath ?? process.env['HARNESS_PROJECT_PATH'] ?? process.cwd();
}

/** Resolve path-based fields that depend on projectPath. */
function resolvePaths(
  overrides: Partial<ServerContext>,
  projectPath: string
): { roadmapPath: string; chartsPath: string } {
  return {
    roadmapPath: overrides.roadmapPath ?? join(projectPath, 'docs', 'roadmap.md'),
    chartsPath: overrides.chartsPath ?? join(projectPath, 'docs', 'roadmap-charts.md'),
  };
}

/**
 * Build the server context from environment variables and defaults.
 * Requires sseManager to be provided — avoids circular value import with sse.ts.
 */
export function buildContext(
  overrides: Partial<ServerContext> & Pick<ServerContext, 'sseManager'>
): ServerContext {
  const projectPath = resolveProjectPath(overrides);
  const paths = resolvePaths(overrides, projectPath);
  return {
    projectPath,
    ...paths,
    cache: overrides.cache ?? new DataCache(60_000),
    pollIntervalMs: overrides.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    sseManager: overrides.sseManager,
    gatherCache: overrides.gatherCache ?? new GatherCache(),
  };
}
