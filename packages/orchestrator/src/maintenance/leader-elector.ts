import type { Result } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

/**
 * Decides which orchestrator instance is responsible for running scheduled
 * maintenance tasks. Decoupled from the issue tracker so single-process
 * deployments and file-backed trackers do not need a tracker round-trip.
 */
export interface LeaderElector {
  electLeader(): Promise<Result<'claimed' | 'rejected', Error>>;
}

/**
 * Default elector for single-process deployments. Always grants leadership.
 * Distributed deployments must supply their own implementation backed by a
 * primitive that provides cross-process mutual exclusion.
 */
export class SingleProcessLeaderElector implements LeaderElector {
  async electLeader(): Promise<Result<'claimed' | 'rejected', Error>> {
    return Ok('claimed' as const);
  }
}
