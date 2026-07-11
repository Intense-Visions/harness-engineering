import type { BackendDef, RoutingRequest } from '@harness-engineering/types';

/**
 * AMR Phase 3 (spec "Assumptions" → Token estimability): a pre-dispatch
 * USD estimate = (estimated blended tokens / 1000) × costPer1kTokens.
 * Pure and deterministic — input tokens from a prompt-size heuristic,
 * output bounded by a fixed budget until Phase-5 usage reconciliation.
 * A def with no capabilities block estimates 0 (invisible to cost).
 */
const DEFAULT_EST_TOKENS = 4000; // conservative bounded blended-token estimate (input+output)

export function estimateCost(def: BackendDef, _req: RoutingRequest): number {
  const rate = def.capabilities?.costPer1kTokens;
  if (rate === undefined || rate === 0) return 0;
  return (DEFAULT_EST_TOKENS / 1000) * rate;
}
