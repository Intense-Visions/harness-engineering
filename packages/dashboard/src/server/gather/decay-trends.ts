import { TimelineManager } from '@harness-engineering/core';
import type { TrendResult } from '@harness-engineering/core';

/**
 * Gather decay trend data from the architecture timeline.
 * Uses TimelineManager to load snapshots and compute trend analysis.
 */
export function gatherDecayTrends(projectPath: string): TrendResult {
  const manager = new TimelineManager(projectPath);
  return manager.trends();
}
