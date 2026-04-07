# Harness Load Testing

> Stress testing, capacity planning, and performance benchmarking with k6, Artillery, and Gatling. Detects existing load test infrastructure, designs test scenarios for critical paths, executes tests, and analyzes results against defined thresholds.

## When to Use

- Before major releases or migrations to validate capacity and identify breaking points
- At milestone boundaries to establish performance baselines for critical endpoints
- When scaling infrastructure and needing to verify new capacity meets demand projections
- NOT for unit-level microbenchmarks (use harness-perf for function-level performance)
- NOT for real-time production monitoring (use observability tooling like Datadog or Grafana)
- NOT for frontend performance audits (use Lighthouse or harness-perf for client-side metrics)

## Process

### Phase 1: DETECT -- Inventory Existing Tests and Infrastructure

1. **Discover load testing tooling.** Scan the project for load test infrastructure:
   - k6: `*.k6.js`, `k6/` directory, `import { check } from 'k6'` patterns
   - Artillery: `artillery.yml`, `artillery/` directory, `config.target` in YAML files
   - Gatling: `gatling/`, `*Simulation.scala`, `gatling.conf`
   - JMeter: `*.jmx` files, `jmeter/` directory
   - Custom: `load-tests/`, `perf/`, `benchmark/` directories

2. **Inventory existing test scenarios.** For each discovered test file:
   - Extract target endpoints and their HTTP methods
   - Identify virtual user counts, ramp-up profiles, and duration
   - Note defined thresholds (p95, p99, error rate, throughput)
   - Check for test data generation or seed data requirements

3. **Map critical endpoints.** Identify endpoints that should be load tested:
   - High-traffic endpoints from route definitions and API documentation
   - Endpoints involved in revenue-critical flows (checkout, payment, subscription)
   - Endpoints with known performance sensitivity (search, aggregation, file upload)
   - Recently changed endpoints from `git log --oneline --since="30 days ago"`

4. **Identify coverage gaps.** Compare critical endpoints against existing test scenarios:
   - Endpoints with no load test coverage
   - Tests with outdated thresholds or missing scenarios (spike, soak)
   - Tests that do not match current API contracts (changed parameters, new endpoints)

5. **Check test infrastructure.** Verify the testing environment:
   - Target environment configuration (staging URL, test database, mock services)
   - CI/CD integration (is load testing part of the pipeline?)
   - Test data availability (seed scripts, fixtures, data generators)

---

### Phase 2: DESIGN -- Define Scenarios and Thresholds

1. **Select test profiles.** Design scenarios for each critical endpoint based on the testing goal:
   - **Smoke test:** 1-5 VUs for 1 minute. Validates the test script works correctly.
   - **Load test:** Expected production traffic for 5-15 minutes. Validates normal operation.
   - **Stress test:** 2-3x expected traffic with ramp-up. Finds the breaking point.
   - **Spike test:** Sudden burst from baseline to 10x traffic. Tests auto-scaling and recovery.
   - **Soak test:** Expected traffic for 1-4 hours. Detects memory leaks and connection pool exhaustion.

2. **Define virtual user profiles.** Model realistic user behavior:
   - Think time between requests (sleep 1-3 seconds between page interactions)
   - Request sequences that mirror real user journeys (browse -> search -> add to cart -> checkout)
   - Authentication flows (login, token refresh, session maintenance)
   - Data variation (different product IDs, user accounts, search queries)

3. **Set performance thresholds.** Define pass/fail criteria per endpoint:
   - **Latency:** p95 < 500ms, p99 < 1000ms (adjust per endpoint SLO)
   - **Error rate:** < 1% for load tests, < 5% for stress tests
   - **Throughput:** Minimum requests per second for the target VU count
   - Thresholds should be derived from SLOs if they exist, or from baseline measurements

4. **Generate test scripts.** Produce test files in the detected tool format:
   - k6: JavaScript test with `stages`, `thresholds`, and `checks`
   - Artillery: YAML config with `phases`, `ensure`, and scenario `flow`
   - Include parameterized data, proper assertions, and tagged metrics

5. **Design ramp-up stages.** For each profile, define the VU ramp schedule:
   - Gradual ramp-up to avoid thundering herd at test start
   - Plateau at target load for measurement stability
   - Optional step-up stages for stress tests to find the exact breaking point
   - Cool-down period to observe recovery behavior

---

### Phase 3: EXECUTE -- Run Tests and Collect Metrics

1. **Validate test environment.** Before executing:
   - Confirm the target URL is a staging/test environment (never run load tests against production without explicit approval)
   - Verify test database is seeded and isolated
   - Check that external dependencies are stubbed or rate-limited appropriately
   - Confirm monitoring is active on the target environment to correlate metrics

2. **Run smoke test first.** Execute each test script with minimal load:
   - 1-2 VUs for 30 seconds
   - Verify all requests return expected status codes
   - Confirm test data and authentication work correctly
   - If smoke test fails, fix the script before proceeding to load tests

3. **Execute the selected test profile.** Run the load test and capture:
   - Request latency distribution (p50, p90, p95, p99, max)
   - Throughput (requests per second over time)
   - Error rate and error type distribution (4xx vs 5xx)
   - Virtual user count over time
   - If using k6: `k6 run --out json=results.json test.k6.js`
   - If using Artillery: `artillery run --output report.json artillery.yml`

4. **Monitor system resources during execution.** If accessible:
   - CPU and memory utilization on target servers
   - Database connection pool usage and query times
   - Queue depths and consumer lag
   - Network I/O and connection counts

5. **Capture baseline or compare to previous run.** Store results for trend analysis:
   - Save raw results to `load-tests/results/YYYY-MM-DD-<profile>.json`
   - If a previous baseline exists, prepare a comparison dataset
   - Tag results with git commit SHA for traceability

---

### Phase 4: ANALYZE -- Interpret Results and Report

1. **Evaluate against thresholds.** For each endpoint tested:
   - Did p95 latency meet the threshold? If not, by how much?
   - Did error rate stay within acceptable bounds?
   - Did throughput meet the minimum target?
   - At what VU count did performance degrade (stress test breaking point)?

2. **Identify bottlenecks.** Correlate performance data with system metrics:
   - High latency + high CPU = compute-bound (optimize algorithm or scale horizontally)
   - High latency + normal CPU = I/O-bound (database queries, external API calls, disk)
   - Increasing errors at specific VU count = resource exhaustion (connection pools, file descriptors, memory)
   - Latency spike at ramp-up = cold start issue (JIT compilation, cache warming, connection establishment)

3. **Calculate capacity projections.** Based on stress test results:
   - Maximum sustainable throughput before p95 exceeds threshold
   - Current headroom as percentage of maximum capacity
   - Projected capacity needed for growth targets (e.g., 2x traffic in 6 months)
   - Scaling recommendation: vertical (bigger instances) vs horizontal (more instances)

4. **Compare to baseline.** If previous results exist:
   - Latency delta per endpoint (regression or improvement)
   - Throughput delta (higher or lower capacity)
   - Error rate delta
   - Flag any regressions greater than 10% as requiring investigation

5. **Produce the load test report.** Output a structured summary:

   ```
   Load Test Report: <profile> — <date>
   Target: <URL> | Tool: <k6/Artillery/Gatling> | Duration: <time>
   Commit: <SHA>

   Results:
     Endpoint          | p50    | p95    | p99    | Errors | RPS   | Status
     GET /api/products | 45ms   | 120ms  | 340ms  | 0.1%   | 850   | PASS
     POST /api/orders  | 180ms  | 520ms  | 1100ms | 0.8%   | 120   | WARN (p99 > 1000ms)
     GET /api/search   | 95ms   | 680ms  | 2100ms | 2.3%   | 340   | FAIL (p99 > 1000ms, errors > 1%)

   Capacity: Max sustainable 1200 RPS at p95 < 500ms (current production: ~400 RPS, 3x headroom)
   Bottleneck: /api/search becomes I/O-bound at 500 RPS — database full-text search query
   Recommendation: Add search index or migrate to Elasticsearch for /api/search
   ```

6. **Archive results.** Save the full report and raw data for historical comparison.

---

## Harness Integration

- **`harness skill run harness-load-testing`** -- Primary CLI entry point. Runs all four phases.
- **`harness validate`** -- Run after generating test scripts to verify project structure.
- **`harness check-deps`** -- Verify load testing tool dependencies are declared (k6, artillery npm package).
- **`emit_interaction`** -- Used before execution (checkpoint:human-verify) to confirm target environment and test profile.
- **`Glob`** -- Discover existing load test files, result archives, and configuration.
- **`Grep`** -- Search for endpoint definitions, route handlers, and threshold configurations.
- **`Write`** -- Generate load test scripts and result reports.
- **`Edit`** -- Update existing test scripts with new scenarios or adjusted thresholds.

## Success Criteria

- All critical endpoints are identified and have corresponding load test scenarios
- Test scripts are syntactically valid and pass a smoke test before full execution
- Thresholds are derived from SLOs or documented baseline measurements, not arbitrary values
- Results include latency percentiles (p50, p95, p99), error rates, and throughput
- Bottlenecks are identified with specific causes (CPU, I/O, connection pool, memory)
- Capacity projections include headroom percentage and scaling recommendations

## Examples

### Example: k6 Load Test for Express.js REST API

```
Phase 1: DETECT
  Tool: k6 (found k6/ directory with 2 existing scripts)
  Existing tests:
    - k6/smoke-api.k6.js: GET /api/health (1 VU, 10s)
    - k6/load-products.k6.js: GET /api/products (50 VUs, 5m, p95 < 300ms)
  Coverage gaps:
    - POST /api/orders — revenue-critical, no load test
    - GET /api/search — high-traffic, no load test
    - No stress or soak test profiles exist

Phase 2: DESIGN
  New scenarios:
    - k6/load-orders.k6.js: POST /api/orders
      Stages: ramp to 100 VUs over 2m, hold 5m, ramp down 1m
      Thresholds: p95 < 800ms, errors < 1%, RPS > 80
    - k6/stress-api.k6.js: All endpoints
      Stages: step-up from 50 to 500 VUs in 50-VU increments, 2m per step
      Thresholds: find breaking point, record p95 at each step
    - k6/soak-api.k6.js: Critical endpoints at expected load
      Duration: 2 hours at 200 VUs
      Thresholds: p95 < 500ms, memory growth < 50MB/hour

Phase 3: EXECUTE
  Environment: https://staging.example.com (verified non-production)
  Smoke: All scripts pass with 1 VU
  Load test results captured to load-tests/results/2026-03-27-load.json

Phase 4: ANALYZE
  Results: POST /api/orders p95=620ms (PASS), GET /api/search p99=2100ms (FAIL)
  Bottleneck: Full-text search on PostgreSQL LIKE query at 300+ RPS
  Capacity: 800 RPS sustainable, current production 250 RPS (3.2x headroom)
  Recommendation: Add pg_trgm index or migrate search to Elasticsearch
```

### Example: Artillery Test for NestJS GraphQL API

```
Phase 1: DETECT
  Tool: Artillery (found artillery.yml with 1 scenario)
  Existing: query { products } at 20 RPS for 60s
  Gaps: mutations not tested, no spike profile, thresholds not defined

Phase 2: DESIGN
  New config: artillery/graphql-load.yml
    Phases:
      - warm-up: 5 RPS for 30s
      - load: 50 RPS for 5m
      - spike: jump to 200 RPS for 30s, back to 50 RPS
    Scenarios:
      - query { products(limit: 20) } — 60% weight
      - mutation { createOrder(input: $input) } — 25% weight
      - query { user(id: $id) { orders } } — 15% weight
    Ensure:
      - p99 < 1500ms
      - maxErrorRate < 2

Phase 3: EXECUTE
  Target: http://staging.internal:3000/graphql
  Smoke: PASS (all queries resolve, auth tokens valid)
  Full run: artillery run --output report.json artillery/graphql-load.yml

Phase 4: ANALYZE
  Results:
    query products: p95=89ms, p99=210ms — PASS
    mutation createOrder: p95=340ms, p99=890ms — PASS
    query user.orders: p95=520ms, p99=2400ms — FAIL
  Bottleneck: N+1 query in user.orders resolver (no DataLoader)
  Spike recovery: System recovered to baseline within 15s after spike — PASS
  Recommendation: Add DataLoader for orders resolver, re-test after fix
```

## Rationalizations to Reject

| Rationalization                                                                                             | Reality                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "The smoke test passed, so the full load test will probably be fine too."                                   | A smoke test at 1-2 VUs tells you the script runs — it says nothing about behavior at 100 or 1000 VUs. Connection pool exhaustion, lock contention, and GC pressure only appear under load. Smoke passing is the floor, not the ceiling.                                 |
| "Staging is smaller than production, so results won't be accurate anyway — no point running the full test." | Staging results are always useful as a proxy: they reveal algorithmic bottlenecks, N+1 queries, and missing indexes that scale identically regardless of instance count. Document the scale factor and use it. Do not skip testing because the environment is imperfect. |
| "We haven't changed the API, so the old load test baselines still apply."                                   | Baselines go stale when dependencies update, traffic patterns shift, or adjacent services change. A deployment that adds one middleware layer or changes a database index can move p99 by 200ms. Baselines must be re-validated, not assumed.                            |
| "The p95 threshold is arbitrary — let's just relax it until the test passes."                               | A threshold without a documented basis is a guess. A threshold lowered to make a failing test pass is a suppressed regression. Thresholds must be derived from SLOs or measured baselines. If the SLO is wrong, change the SLO explicitly with stakeholder sign-off.     |
| "We'll run the soak test later — we just need to ship the load test first."                                 | Soak tests catch failures that only emerge over hours: memory leaks, connection pool exhaustion, log file growth. If the feature involves a long-lived process, background worker, or WebSocket, skipping the soak test means the failure surfaces in production.        |

## Gates

- **No load tests against production without explicit human approval.** Load tests can cause real outages. The target environment must be verified as non-production before execution. If production testing is required, a `[checkpoint:human-verify]` must be passed with documented approval.
- **No test execution with failing smoke tests.** If the smoke test fails, the test script is broken. Fix the script before running at load. Running broken scripts at scale wastes time and produces meaningless results.
- **No capacity claims without stress test data.** Capacity projections require finding the actual breaking point. A load test that passes at the expected level does not establish maximum capacity. Stress test data is required for credible projections.
- **No threshold changes without documented justification.** If thresholds are relaxed from a previous baseline, the reason must be documented (e.g., "p95 threshold increased from 300ms to 500ms due to added encryption overhead per SEC-2026-04 requirement").

## Escalation

- **When the staging environment does not match production configuration:** Load test results against a differently-sized environment are misleading. Report: "Staging has [N] instances with [M] CPU/RAM. Production has [X] instances with [Y] CPU/RAM. Results should be scaled by a factor of [ratio], but this is approximate. Recommend matching staging to production configuration for accurate capacity planning."
- **When external dependencies cannot be stubbed for load testing:** Real external APIs may rate-limit or block load test traffic. Report: "The [dependency] cannot be stubbed and will rate-limit at [N] RPS. Options: (1) use a mock service like WireMock, (2) test with a dedicated sandbox API key, (3) test only the internal service layer with the external call short-circuited."
- **When load test results are inconsistent between runs:** Noisy results indicate environmental interference. Report: "Variance between runs exceeds 15% for [endpoint]. Possible causes: shared staging environment, garbage collection pauses, network congestion. Recommend running 3 iterations and using the median, or running on a dedicated isolated environment."
- **When the breaking point is below expected production traffic:** This is a capacity emergency. Report: "The system breaks at [N] RPS but production receives [M] RPS. Immediate scaling action required. Short-term: increase instance count by [factor]. Long-term: address the identified bottleneck in [component]."
