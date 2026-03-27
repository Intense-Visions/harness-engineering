# Harness Feature Flags

> Flag lifecycle management, A/B testing infrastructure, and gradual rollout design. Ship features safely with controlled exposure and clean retirement.

## When to Use

- When designing feature flag architecture for a new project or feature
- When auditing existing flags for staleness, test coverage, or hygiene
- When planning gradual rollout or A/B testing strategies
- NOT for deployment pipeline configuration (use harness-deployment)
- NOT for environment variable management (use harness-secrets)
- NOT for application performance testing under flag variants (use harness-perf)

## Process

### Phase 1: DETECT -- Discover Flag Definitions and Usage

1. **Identify flag provider.** Scan the project for feature flag infrastructure:
   - **Third-party SDKs:** LaunchDarkly (`launchdarkly-node-server-sdk`), Unleash (`unleash-client`), Flagsmith (`flagsmith-nodejs`), Split (`@splitsoftware/splitio`)
   - **Custom implementations:** Files matching `*feature-flag*`, `*toggle*`, `*flags*`
   - **Configuration-based:** `flags.json`, `features.json`, `feature-flags.yaml`
   - **Environment-based:** Feature flags controlled via environment variables (`FEATURE_*`, `FF_*`)

2. **Catalog all flag definitions.** For each flag found, record:
   - Flag name/key
   - Flag type (boolean, multivariate, percentage rollout)
   - Default value (what happens when the flag service is unreachable)
   - Where it is defined (provider dashboard, config file, code)
   - Creation date or first appearance in git history

3. **Map flag usage in code.** For each flag, find all evaluation points:
   - Source files that check the flag value
   - Conditional branches gated by the flag
   - Components that render differently based on flag state
   - API endpoints with flag-dependent behavior
   - Test files that exercise flag variants

4. **Detect flag categories.** Classify each flag:
   - **Release flag:** Gates a new feature for gradual rollout (temporary)
   - **Experiment flag:** Controls A/B test variants (temporary)
   - **Ops flag:** Circuit breaker or kill switch (permanent)
   - **Permission flag:** Controls access to premium features (permanent)

5. **Present detection summary:**

   ```
   Feature Flag Detection:
     Provider: LaunchDarkly (SDK v7.x)
     Flags defined: 23
     Flags evaluated in code: 19 (4 defined but unused)
     Categories: 12 release, 5 experiment, 4 ops, 2 permission
     Stale candidates: 6 (release flags older than 90 days)
   ```

---

### Phase 2: DESIGN -- Recommend Flag Architecture and Rollout Strategy

1. **Evaluate flag naming convention.** Check for consistency:
   - Recommended format: `{team}.{feature}.{variant}` (e.g., `payments.stripe-v2.enabled`)
   - Flags should have descriptive names (not `flag_123` or `test_flag`)
   - Naming should indicate category (prefix with `ops.` for operational flags)
   - Temporary flags should include a target removal date in metadata

2. **Design flag evaluation architecture.** Recommend patterns for:
   - **Server-side evaluation:** Flags evaluated on the backend, consistent behavior
   - **Client-side evaluation:** Flags evaluated in the browser/app, real-time updates
   - **Edge evaluation:** Flags evaluated at CDN layer for zero-latency decisions
   - **Default values:** Every flag must have a safe default (feature off) for provider outages

3. **Design rollout strategy.** For release flags:
   - **Percentage rollout:** Start at 1%, monitor metrics, increase to 5%, 25%, 50%, 100%
   - **User segment targeting:** Internal users first, then beta users, then general availability
   - **Geographic rollout:** Single region first, expand after validation
   - **Time-based gates:** Enable during low-traffic periods for initial validation
   - Define success criteria for each rollout stage (error rate, latency, conversion)

4. **Design A/B testing infrastructure.** For experiment flags:
   - Consistent user assignment (same user always sees same variant)
   - Statistical significance calculation before declaring a winner
   - Event tracking integration for measuring experiment outcomes
   - Guardrail metrics that auto-disable experiments if health degrades
   - Experiment duration limits (no indefinite experiments)

5. **Design fallback behavior.** Ensure resilience:
   - Provider SDK timeout configuration (fail fast, not block)
   - Local cache for flag values (stale-while-revalidate)
   - Default values that are safe (feature disabled, not enabled)
   - Circuit breaker on flag evaluation errors
   - Monitoring on flag evaluation latency and error rate

---

### Phase 3: VALIDATE -- Verify Flag Hygiene and Test Coverage

1. **Check test coverage per flag.** For each flag, verify:
   - Tests exist for both the flag-on and flag-off code paths
   - Integration tests cover the default value behavior (provider down scenario)
   - No tests depend on a specific flag value being set in production
   - Test utilities exist for overriding flag values in test context

2. **Validate flag consistency.** Check for common issues:
   - Flags checked in code but not defined in the provider (will use defaults)
   - Flags defined in the provider but never checked in code (dead flags)
   - Same flag checked with different keys in different files (typos)
   - Nested flag checks that create combinatorial complexity

3. **Check for flag coupling.** Identify problematic patterns:
   - Flags that depend on other flags (if A and B, then C)
   - Flags that must be enabled in a specific order
   - Flags that share state or side effects
   - Recommend decoupling or consolidating dependent flags

4. **Validate rollout configuration.** For active rollouts:
   - Percentage values are within expected ranges
   - Targeting rules are correctly configured
   - Kill switch is functional (can disable the feature instantly)
   - Rollback plan is documented

5. **Generate validation report:**

   ```
   Flag Validation: [PASS/WARN/FAIL]

   Test coverage: WARN (3 flags missing flag-off tests)
   Consistency: PASS (all code references match definitions)
   Coupling: WARN (2 flags have interdependencies)
   Rollout config: PASS (active rollouts correctly configured)

   Issues:
     1. payments.stripe-v2 -- no test for flag-off fallback path
     2. search.new-algorithm + search.reranking -- coupled flags
     3. checkout.express -- missing kill switch test
   ```

---

### Phase 4: LIFECYCLE -- Audit Stale Flags and Plan Cleanup

1. **Identify stale flags.** Flag candidates for removal:
   - Release flags that have been at 100% for more than 30 days
   - Experiment flags past their declared end date
   - Flags with no evaluation in the last 90 days (from provider analytics)
   - Flags whose feature has been fully adopted (no rollback expected)

2. **Generate cleanup plan.** For each stale flag:
   - List all code locations that reference the flag
   - Identify which branch to keep (the flag-on path for graduated features)
   - Estimate lines of code to remove (dead branch cleanup)
   - Determine if any tests need updating after flag removal
   - Assign a cleanup owner and deadline

3. **Assess technical debt.** Calculate flag burden:
   - Total active flags per service (recommend under 20)
   - Ratio of temporary to permanent flags
   - Average flag age for temporary flags
   - Code complexity added by flag branching (conditional paths)
   - Estimate of test matrix growth due to flags

4. **Recommend lifecycle policies.** Design governance:
   - Maximum lifetime for release flags (e.g., 90 days)
   - Maximum lifetime for experiment flags (e.g., 30 days)
   - Required metadata: owner, creation date, expiry date, cleanup ticket
   - Automated alerting when flags exceed their lifetime
   - Monthly flag review cadence with the team

5. **Generate lifecycle report:**

   ```
   Flag Lifecycle Report:

   Active flags: 23
   Stale flags: 6 (candidates for removal)
   Technical debt: ~340 lines of dead code across 6 stale flags

   Cleanup plan:
     1. payments.old-checkout -- at 100% for 45 days, 4 files, ~80 LOC to remove
     2. search.v1-algorithm -- experiment ended 60 days ago, 2 files, ~40 LOC
     3. onboarding.legacy-flow -- at 100% for 90 days, 6 files, ~120 LOC
     4. notifications.email-v1 -- unused for 120 days, 3 files, ~50 LOC
     5. dashboard.old-charts -- at 100% for 35 days, 2 files, ~30 LOC
     6. auth.password-reset-v1 -- at 100% for 60 days, 1 file, ~20 LOC

   Recommendations:
     - Adopt 90-day maximum lifetime policy for release flags
     - Add flag expiry dates to LaunchDarkly metadata
     - Schedule monthly flag cleanup sprint
     - Target: reduce active flag count from 23 to 17
   ```

---

## Harness Integration

- **`harness skill run harness-feature-flags`** -- Primary invocation for flag analysis and lifecycle management.
- **`harness validate`** -- Run after flag cleanup to verify project health.
- **`harness check-deps`** -- Verify flag provider SDK dependencies are installed.
- **`emit_interaction`** -- Present lifecycle report and gather decisions on cleanup priorities.

## Success Criteria

- All feature flags in the project are discovered and cataloged
- Flags are categorized by type (release, experiment, ops, permission)
- Stale flags are identified with specific cleanup plans
- Test coverage for both flag-on and flag-off paths is verified
- Rollout configuration is validated for active flags
- Lifecycle policies are recommended with enforcement mechanisms

## Examples

### Example: React SPA with LaunchDarkly

```
Phase 1: DETECT
  Provider: LaunchDarkly (React SDK v3.x)
  Flags defined: 15 (in LaunchDarkly dashboard)
  Flags in code: 13 (2 unused in dashboard)
  Categories: 8 release, 3 experiment, 2 ops

Phase 2: DESIGN
  Naming: WARN -- inconsistent (mix of camelCase and kebab-case)
  Recommended convention: team.feature.variant (kebab-case)
  Evaluation: Client-side (React SDK), 200ms init timeout
  Default values: WARN -- 2 flags default to true (should default to false)
  Rollout: checkout.express-pay at 25% (targeting premium users)

Phase 3: VALIDATE
  Test coverage: WARN -- 4 flags missing useFlags mock in component tests
  Consistency: PASS
  Coupling: PASS (no interdependent flags)
  Kill switch: PASS (all release flags can be instantly disabled)

Phase 4: LIFECYCLE
  Stale: 3 flags at 100% for 30+ days
  Cleanup estimate: 180 LOC across 8 files
  Recommendation: Remove search.v2-results (at 100% for 65 days, 3 components)
  Result: WARN -- 3 stale flags, 4 missing tests, 2 unsafe defaults
```

### Example: Spring Boot API with Custom Flag System

```
Phase 1: DETECT
  Provider: Custom implementation (FeatureFlagService.java)
  Flag store: PostgreSQL table (feature_flags)
  Flags defined: 28
  Flags in code: 24 (4 in database but unreferenced)
  Categories: 15 release, 6 experiment, 5 ops, 2 permission

Phase 2: DESIGN
  Architecture: Server-side evaluation with 60s cache refresh
  Concern: No SDK resilience -- database outage disables all flags
  Recommend: Add in-memory cache with stale-while-revalidate pattern
  Recommend: Add health check endpoint for flag service status
  Rollout: Using percentage field in database -- no segment targeting
  Recommend: Add user segment support for targeted rollouts

Phase 3: VALIDATE
  Test coverage: WARN -- @FeatureFlag annotation used but no test helper
    to toggle flags in test context (tests rely on database state)
  Consistency: WARN -- 4 database entries have no code references
  Coupling: FAIL -- 3 flags form a dependency chain
    (billing.new-pricing requires billing.tax-calc-v2 requires billing.currency-v3)
  Recommend: Consolidate into single billing.pricing-v3 flag

Phase 4: LIFECYCLE
  Stale: 8 flags enabled for all users for 60+ days
  Technical debt: ~520 LOC of dead code
  Flag count: 28 (above recommended 20 per service)
  Recommendation: Immediate cleanup sprint targeting 8 stale flags
  Recommendation: Enforce 60-day lifetime policy going forward
  Result: FAIL -- flag coupling detected, high stale flag count
```

## Gates

- **No flags without default values.** Every flag evaluation must specify a default value for provider outage scenarios. Missing defaults are blocking findings.
- **No stale release flags beyond policy limit.** Release flags that exceed their maximum lifetime (default 90 days at 100%) are blocking warnings. They must be cleaned up or have an explicit extension with documented justification.
- **No coupled flag dependencies.** Flags that require other flags to be in a specific state create combinatorial complexity and are fragile. Flag coupling is a blocking finding that requires consolidation.
- **No flags without test coverage for both paths.** Feature flags that lack tests for the off-path leave the fallback behavior unverified. Both paths must be tested.

## Escalation

- **When flag count exceeds 30 per service:** The flag system is becoming a maintenance burden. Recommend a flag audit sprint with a target of reducing to under 20. Prioritize removing the oldest release flags first.
- **When a flag provider outage affects production:** If the application does not handle provider unavailability gracefully, this is an architectural issue. Recommend implementing local caching, safe defaults, and a circuit breaker pattern before adding more flags.
- **When experiment results are inconclusive:** Do not extend the experiment indefinitely. Recommend increasing sample size (broader targeting), simplifying the variants, or declaring the experiment inconclusive and removing it.
- **When flag cleanup requires database migration:** Removing flags that are stored in a database may require migration scripts. Coordinate cleanup with a release cycle and ensure rollback is possible if the migration fails.
