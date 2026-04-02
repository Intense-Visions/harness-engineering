import type { FeatureStatus } from '@harness-engineering/types';

/**
 * Status rank for directional protection.
 * Sync may only advance status forward (higher rank) unless forceSync is set.
 * Shared between local sync (sync.ts) and external tracker sync (sync-engine.ts).
 */
export const STATUS_RANK: Record<FeatureStatus, number> = {
  backlog: 0,
  planned: 1,
  blocked: 1, // lateral to planned — sync can move to/from blocked freely
  'in-progress': 2,
  done: 3,
};

export function isRegression(from: FeatureStatus, to: FeatureStatus): boolean {
  return STATUS_RANK[to] < STATUS_RANK[from];
}
