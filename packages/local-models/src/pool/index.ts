/**
 * Pool — public barrel.
 *
 * Phase 3a stands up the persistence primitive (`PoolStateStore`) and the
 * `lowestScoreLru` eviction planner. Phase 3c stacks the `PoolManager`
 * orchestrator on top, composing the store + planner with Phase 3b's
 * `InstallAdapter`. The `LocalModelResolver` integration (Phase 4), proposal
 * engine (Phase 5b), scheduler (Phase 6), and CLI / HTTP / dashboard surfaces
 * (Phase 7 / 8) all consume the manager.
 */

export {
  PoolStateStore,
  DEFAULT_POOL_STATE_PATH,
  POOL_STATE_VERSION,
  isPoolStateFile,
} from './state.js';
export type { PoolFilesystem, PoolStateFile, PoolStateStoreOptions } from './state.js';

export { planEviction, sortByEvictionOrder } from './eviction.js';
export type { EvictionRequest } from './eviction.js';

export { EmptyPoolState } from './types.js';
export type { EvictionCandidate, EvictionPlan, PoolEntry, PoolState } from './types.js';

export { PoolManager } from './manager.js';
export type {
  AllowCheckRequest,
  ConfigurePoolRequest,
  EvictPoolRequest,
  EvictPoolResult,
  InstallPoolRequest,
  InstallPoolResult,
  PoolManagerErrorCode,
  PoolManagerOptions,
  ReconcileRequest,
  ReconcileResult,
  ScoreUpdate,
} from './manager.js';
