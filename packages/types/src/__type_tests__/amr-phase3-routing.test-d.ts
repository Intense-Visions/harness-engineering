/**
 * AMR Phase 3 — typecheck-only fixture.
 *
 * NOT executed at runtime (excluded from the runtime build; compiled only by
 * `pnpm --filter @harness-engineering/types typecheck`). A failure to compile
 * here is a regression on the AMR Phase 3 surface contract:
 *   - RoutingConfig gains an optional `policy?: RoutingPolicy` (D11 default-off gate)
 *   - RoutingDecision gains optional complexity/tierRequired/estCostUsd (SC9)
 * Both must remain OPTIONAL so every pre-AMR config/decision compiles unchanged.
 */
import type {
  RoutingConfig,
  RoutingDecision,
  RoutingPolicy,
  ComplexityVerdict,
  CapabilityTier,
} from '../index';

// --- 1. RoutingConfig accepts an opt-in policy (present) ---
const _cfgWithPolicy: RoutingConfig = {
  default: 'claude-opus',
  policy: {
    budget: { capUsd: 0, onBudgetExhausted: 'degrade' },
  } satisfies RoutingPolicy,
};
void _cfgWithPolicy;

// --- 2. RoutingConfig WITHOUT policy still compiles (back-compat / pre-AMR / default-off) ---
// (Under exactOptionalPropertyTypes an explicit `policy: undefined` is disallowed;
//  absence is the canonical default-off shape.)
const _cfgNoPolicy: RoutingConfig = { default: 'claude-opus' };
void _cfgNoPolicy;

// --- 4. RoutingDecision enrichment fields are asserted in Task 2 (below, appended). ---
// Keep the imports referenced so the fixture stays typecheck-clean between tasks.
void (undefined as unknown as ComplexityVerdict | undefined);
void (undefined as unknown as CapabilityTier | undefined);
void (undefined as unknown as RoutingDecision | undefined);
