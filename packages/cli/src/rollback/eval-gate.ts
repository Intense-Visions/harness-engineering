import type { HarnessConfig } from '../config/schema';
import type { RollbackDecision } from '@harness-engineering/core';

/**
 * Whether the eval arm (post-merge `pull_request:[closed]` trigger) is live.
 * DARK by default in v1: `rollback.evalTrigger.enabled` is `false` unless a
 * project explicitly opts in (Phase 4 / #31). The signal arm (`sweep`) is
 * unaffected by this flag.
 */
export function isEvalArmEnabled(config: HarnessConfig): boolean {
  return config.rollback?.evalTrigger?.enabled === true;
}

/**
 * Self-gate for the eval arm: no-op when the arm is disabled. This is the CLI's
 * "gates-itself" mechanism — the workflow always invokes the CLI, and the CLI
 * decides whether to fire. With the flag off (v1 default) it opens no PR and
 * simply resolves `{ skipped: true }`. The `evaluate` seam is expected to bind
 * `trigger: 'eval'` at the call site.
 */
export async function runEvalTriggerIfEnabled(
  config: HarnessConfig,
  pr: number,
  deps: { evaluate: (pr: number) => Promise<RollbackDecision> }
): Promise<RollbackDecision | { skipped: true }> {
  if (!isEvalArmEnabled(config)) return { skipped: true };
  return deps.evaluate(pr);
}
