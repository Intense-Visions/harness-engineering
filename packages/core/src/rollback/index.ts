/**
 * Rollback module — post-ship revert-readiness classification.
 * Pure, IO-injected: git/gh are reached only through the `RollbackIO` seam.
 */
export type { RollbackDecision, ClassifyInput, LaterMerge } from './types';
export type { RollbackIO, ResolvedTarget } from './io';
export { classifyRevert } from './classify';
