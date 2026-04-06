import { join } from 'node:path';
import { DataCache } from './cache';
import { SSEManager } from './sse';
import { DEFAULT_POLL_INTERVAL_MS } from '../shared/constants';

export interface ServerContext {
  /** Resolved absolute path to docs/roadmap.md */
  roadmapPath: string;
  /** Resolved absolute path to the project root */
  projectPath: string;
  /** Resolved absolute path to docs/roadmap-charts.md */
  chartsPath: string;
  /** Shared in-memory cache (60s TTL) */
  cache: DataCache;
  /** SSE polling interval in milliseconds */
  pollIntervalMs: number;
  /** Shared SSE manager instance */
  sseManager: SSEManager;
}

/**
 * Build the server context from environment variables and defaults.
 * roadmapPath and projectPath default to the current working directory.
 */
export function buildContext(overrides?: Partial<ServerContext>): ServerContext {
  const projectPath =
    overrides?.projectPath ?? process.env['HARNESS_PROJECT_PATH'] ?? process.cwd();
  const roadmapPath = overrides?.roadmapPath ?? join(projectPath, 'docs', 'roadmap.md');
  const chartsPath = overrides?.chartsPath ?? join(projectPath, 'docs', 'roadmap-charts.md');
  return {
    projectPath,
    roadmapPath,
    chartsPath,
    cache: overrides?.cache ?? new DataCache(60_000),
    pollIntervalMs: overrides?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    sseManager: overrides?.sseManager ?? new SSEManager(),
  };
}
