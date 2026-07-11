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

// --- 4. RoutingDecision accepts the three optional AMR enrichment fields (SC9) ---
const _verdict: ComplexityVerdict = {
  level: 'complex',
  confidence: 'high',
  signals: {},
  source: 'static',
};
const _enriched: RoutingDecision = {
  timestamp: '2026-07-11T00:00:00.000Z',
  useCase: { kind: 'tier', tier: 'quick-fix' },
  resolutionPath: [],
  backendName: 'local-fast',
  backendType: 'local',
  durationMs: 0.1,
  complexity: _verdict,
  tierRequired: 'strong' satisfies CapabilityTier,
  estCostUsd: 0.012,
};
void _enriched;

// --- 5. RoutingDecision omitting all three enrichment fields still compiles (back-compat) ---
const _bare: RoutingDecision = {
  timestamp: '2026-07-11T00:00:00.000Z',
  useCase: { kind: 'tier', tier: 'quick-fix' },
  resolutionPath: [],
  backendName: 'local-fast',
  backendType: 'local',
  durationMs: 0.1,
};
void _bare;
