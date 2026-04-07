# Harness Resilience

> Circuit breakers, rate limiting, bulkheads, retry patterns, and fault tolerance analysis. Detects missing resilience patterns, evaluates failure modes, and recommends concrete configurations for production-grade fault tolerance.

## When to Use

- When adding new external service integrations (APIs, databases, message queues) that need fault tolerance
- On PRs that modify service-to-service communication, HTTP clients, or middleware chains
- To audit existing resilience patterns for correctness, completeness, and observability
- NOT for load testing or capacity planning (use harness-load-testing)
- NOT for incident response after a failure has occurred (use harness-incident-response)
- NOT for security-focused rate limiting like DDoS protection (use harness-security-review)

## Process

### Phase 1: DETECT -- Identify Dependencies and Existing Patterns

1. **Inventory external dependencies.** Scan the codebase for outbound connections:
   - HTTP clients: `axios`, `fetch`, `got`, `HttpClient`, `RestTemplate`, `reqwest`
   - Database connections: connection pool configs, ORM initialization, query builders
   - Message queues: RabbitMQ, Kafka, SQS, Redis pub/sub client initialization
   - gRPC channels: proto client stubs, channel creation, dial options
   - Third-party SDKs: Stripe, Twilio, SendGrid, AWS SDK calls

2. **Map existing resilience patterns.** For each dependency found, check for:
   - Circuit breakers: `opossum`, `cockatiel`, `Polly`, `resilience4j`, `hystrix` usage
   - Retry logic: exponential backoff, jitter, max attempts configuration
   - Timeouts: connection and request timeout settings
   - Rate limiters: token bucket, sliding window, or fixed window implementations
   - Bulkheads: thread pool isolation, semaphore limits, connection pool sizing
   - Fallbacks: cache-aside patterns, default values, degraded responses

3. **Detect anti-patterns.** Flag common resilience mistakes:
   - Unbounded retries without backoff or max attempts
   - Missing timeouts on HTTP clients or database queries
   - Circuit breaker without a fallback handler
   - Retry on non-idempotent operations (POST, DELETE without idempotency keys)
   - Rate limiter with no monitoring or alerting on limit hits

4. **Build the dependency map.** Produce a structured inventory:
   - Dependency name, type (HTTP, gRPC, database, queue), criticality (critical, degraded, optional)
   - Current resilience patterns applied (or "none")
   - Identified gaps and anti-patterns

---

### Phase 2: ANALYZE -- Evaluate Failure Modes

1. **Classify failure modes per dependency.** For each external dependency:
   - **Timeout:** The dependency responds too slowly or not at all
   - **Error burst:** The dependency returns errors at a rate above normal
   - **Partial degradation:** The dependency responds but with reduced functionality
   - **Total outage:** The dependency is completely unreachable
   - **Data inconsistency:** The dependency returns stale or incorrect data

2. **Assess blast radius.** For each failure mode:
   - Which features become unavailable?
   - Which downstream services are affected?
   - What is the user-visible impact?
   - Can the system continue to serve other requests?

3. **Evaluate current coverage.** Score each dependency on resilience coverage:
   - **Full:** Circuit breaker + retry + timeout + fallback + monitoring
   - **Partial:** Some patterns present but gaps exist (e.g., retry without circuit breaker)
   - **None:** No resilience patterns applied

4. **Prioritize gaps by risk.** Combine criticality and coverage:
   - Critical dependency with no resilience = P0 (immediate)
   - Critical dependency with partial resilience = P1 (next sprint)
   - Optional dependency with no resilience = P2 (backlog)
   - Any dependency with anti-patterns = P0 (anti-patterns are active risks)

5. **Check observability.** For existing patterns, verify they emit metrics:
   - Circuit breaker state changes (open/half-open/closed)
   - Retry attempt counts and final outcomes
   - Rate limiter rejection counts
   - Timeout occurrences

---

### Phase 3: DESIGN -- Recommend Resilience Patterns

1. **Select patterns per dependency.** Based on the failure mode analysis:
   - **HTTP APIs:** Circuit breaker (opossum/cockatiel) + exponential backoff with jitter + request timeout + fallback
   - **Databases:** Connection pool sizing + query timeout + read replica fallback + bulkhead isolation
   - **Message queues:** Dead letter queue + retry with backoff + idempotent consumers + circuit breaker on publish
   - **gRPC services:** Deadline propagation + retry policy + load balancing + circuit breaker

2. **Provide concrete configurations.** For each recommended pattern, specify:
   - Library and version to use
   - Configuration values with rationale (e.g., "timeout: 3000ms based on p99 latency of 1200ms with 2.5x headroom")
   - Threshold values for circuit breakers (failure rate, sample window, reset timeout)
   - Retry parameters (max attempts, base delay, max delay, jitter factor)
   - Rate limits (requests per window, window size, burst allowance)

3. **Design fallback strategies.** For each critical dependency:
   - **Cache fallback:** Serve stale data from Redis/memory cache with a staleness indicator
   - **Default fallback:** Return a safe default value with a degraded flag
   - **Queue fallback:** Accept the request and process it asynchronously when the dependency recovers
   - **Feature flag fallback:** Disable the feature entirely via feature flag

4. **Generate implementation templates.** Produce code snippets for:
   - Circuit breaker wrapping an existing HTTP client
   - Retry middleware with exponential backoff and jitter
   - Rate limiter middleware for Express/Fastify/NestJS
   - Bulkhead pattern using semaphore or connection pool limits

5. **Define health check contracts.** Specify how each dependency should be health-checked:
   - Endpoint or query to use for liveness check
   - Timeout for the health check itself
   - Frequency and failure threshold before marking unhealthy

---

### Phase 4: VALIDATE -- Verify Implementation and Observability

1. **Check pattern correctness.** For each implemented pattern:
   - Circuit breaker: Verify threshold configuration, half-open behavior, and reset timeout
   - Retry: Verify idempotency of retried operations, backoff curve, and max attempts
   - Timeout: Verify timeout values are set on both client and server sides
   - Rate limiter: Verify limit values, window type, and rejection response format

2. **Verify test coverage.** Check that resilience patterns are tested:
   - Circuit breaker tests: closed-to-open transition, open rejection, half-open recovery
   - Retry tests: successful retry, max attempts exhaustion, non-retryable error bypass
   - Timeout tests: timeout triggers fallback, timeout does not leak connections
   - Rate limiter tests: under-limit passes, at-limit rejects, window reset behavior

3. **Verify observability.** Confirm that metrics are emitted:
   - Check for Prometheus counters/histograms or StatsD calls on pattern events
   - Verify structured logging includes circuit breaker state, retry attempt number, and rate limit headers
   - Confirm dashboard or alert configurations reference the new metrics

4. **Produce the resilience report.** Output a summary:
   - Number of dependencies analyzed
   - Coverage before and after (percentage with full/partial/none resilience)
   - Anti-patterns found and resolved
   - Remaining gaps with priority and recommended timeline

5. **Run integration verification.** If integration tests exist:
   - Execute tests that exercise the resilience patterns (chaos test stubs, fault injection)
   - Verify graceful degradation under simulated failure conditions
   - Confirm that fallbacks produce acceptable user-facing responses

---

## Harness Integration

- **`harness skill run harness-resilience`** -- Primary CLI entry point. Runs all four phases.
- **`harness validate`** -- Run after implementing recommended patterns to verify project integrity.
- **`harness check-deps`** -- Verify that new resilience libraries are properly declared and within boundary rules.
- **`emit_interaction`** -- Used at pattern selection (checkpoint:decision) when multiple valid patterns exist and trade-offs require human judgment.
- **`Glob`** -- Discover HTTP clients, middleware chains, and existing resilience pattern files.
- **`Grep`** -- Search for timeout configurations, retry logic, circuit breaker initialization, and anti-patterns.
- **`Write`** -- Generate implementation templates and resilience configuration files.
- **`Edit`** -- Add resilience wrappers to existing service clients.

## Success Criteria

- All external dependencies are inventoried with their resilience coverage level
- Anti-patterns are identified with specific file locations and line numbers
- Recommendations include concrete library versions and configuration values, not just pattern names
- Fallback strategies are defined for every critical dependency
- Implementation templates compile and follow the project's existing code style
- Observability is addressed: every pattern emits metrics or structured logs

## Examples

### Example: Express.js API with Stripe and PostgreSQL

```
Phase 1: DETECT
  Dependencies found:
    - Stripe API (HTTP, critical): axios client in src/payments/stripe-client.ts
      Resilience: timeout=5000ms, no retry, no circuit breaker, no fallback
    - PostgreSQL (database, critical): pg pool in src/db/pool.ts
      Resilience: pool max=20, no query timeout, no read replica fallback
    - SendGrid (HTTP, optional): @sendgrid/mail in src/notifications/email.ts
      Resilience: none

  Anti-patterns:
    - src/payments/stripe-client.ts:45 — retry on POST /charges without idempotency key
    - src/db/pool.ts — no statement_timeout configured

Phase 2: ANALYZE
  Stripe failure modes:
    - Timeout: Payment page hangs, user retries, duplicate charges possible
    - Outage: All payments fail, revenue impact immediate
    - Blast radius: checkout flow, subscription renewal, refund processing
  Risk: P0 (critical + partial coverage + anti-pattern)

Phase 3: DESIGN
  Stripe recommendations:
    - Add opossum circuit breaker: failureThreshold=50%, resetTimeout=30s
    - Add idempotency key to all Stripe charge requests
    - Set timeout to 8000ms (Stripe p99 is ~3s, 2.5x headroom)
    - Fallback: queue payment for async retry via Bull queue
  PostgreSQL recommendations:
    - Set statement_timeout=5000 in pool config
    - Add pg-pool error handler with connection retry
    - Configure read replica for GET endpoints via pgBouncer

Phase 4: VALIDATE
  Resilience coverage: 33% -> 100% (3/3 dependencies covered)
  Anti-patterns resolved: 2/2
  Tests needed: circuit breaker state transitions, idempotency key generation
```

### Example: NestJS Microservices with gRPC and Redis

```
Phase 1: DETECT
  Dependencies found:
    - user-service (gRPC, critical): @grpc/grpc-js in src/clients/user.client.ts
      Resilience: deadline=5s, no retry, no circuit breaker
    - inventory-service (gRPC, critical): no resilience configured
    - Redis (cache, degraded): ioredis in src/cache/redis.ts
      Resilience: reconnectOnError, no bulkhead, no fallback

Phase 2: ANALYZE
  inventory-service outage:
    - Product pages return 503, search results empty
    - Blast radius: catalog, search, cart validation
    - Risk: P0 (critical + no coverage)

Phase 3: DESIGN
  inventory-service recommendations:
    - Add cockatiel circuit breaker with ConsecutiveBreaker(5)
    - Add retry with exponentialBackoff(1000, 2) maxAttempts=3
    - Add deadline propagation from gateway timeout
    - Fallback: serve cached inventory from Redis with staleness header
  Redis recommendations:
    - Add bulkhead: maxPoolSize=50, separate pools for cache vs sessions
    - Add fallback: in-memory LRU cache (lru-cache, max 1000 items)
    - Monitor: emit redis.command.duration histogram

Phase 4: VALIDATE
  Coverage: 33% -> 100%
  Tests verified: gRPC circuit breaker opens after 5 failures,
    Redis fallback serves from LRU when Redis is down
```

## Rationalizations to Reject

| Rationalization                                                                     | Reality                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "That third-party API has 99.99% uptime — we don't need a circuit breaker"          | 99.99% uptime means 52 minutes of downtime per year. That downtime will not occur as one predictable window — it will happen as degraded responses and timeouts during a traffic spike. Without a circuit breaker, every caller blocks for the full timeout duration, exhausting thread pools and cascading across the system. |
| "We have retry logic, so failures are handled"                                      | Retry logic without a circuit breaker amplifies failures. When the downstream service is degraded, retries multiply the load on an already struggling system. Circuit breakers and retries are complementary controls, not alternatives.                                                                                       |
| "The fallback adds complexity — we'll add it if the circuit breaker actually opens" | A circuit breaker without a fallback is a different kind of failure mode, not resilience. When the circuit opens, users see an error instead of a degraded-but-functional experience. Fallbacks must be designed and tested before the circuit ever opens in production.                                                       |
| "Our database connection pool is 100 connections — that's plenty"                   | Connection pool size without query timeouts means slow queries hold connections indefinitely. A single slow query spike can exhaust the pool, causing every subsequent request to wait. Pool sizing and query timeouts are both required.                                                                                      |
| "The service is internal — it doesn't need rate limiting"                           | Internal services are often called by automated processes, CI pipelines, and batch jobs that can spike traffic in ways user-facing services do not. Missing rate limiting on internal services is a common cause of self-inflicted outages during deployments and data migrations.                                             |

## Gates

- **No retry on non-idempotent operations without idempotency keys.** Retrying a POST or DELETE that lacks an idempotency mechanism can cause data duplication or data loss. This is a blocking finding. The operation must be made idempotent before retry logic is added.
- **No circuit breaker without a fallback.** A circuit breaker that opens and returns a raw error to the user is not resilience -- it is a different kind of failure. Every circuit breaker must have a defined fallback behavior (cache, default, queue, or feature flag).
- **No unbounded retries.** Retry logic must have a max attempt limit and use exponential backoff with jitter. Unbounded retries with fixed delays cause thundering herd problems and amplify failures.
- **No resilience pattern without observability.** A circuit breaker that opens silently is invisible to operations. Every pattern must emit metrics or structured logs that can trigger alerts.

## Escalation

- **When a dependency has no documentation on failure behavior:** Report: "The [dependency] has no documented error codes or failure modes. Recommend contacting the provider for SLA details, or instrumenting the client to collect failure statistics over a 2-week baseline period."
- **When resilience patterns conflict with latency requirements:** Adding retries and circuit breakers increases tail latency. Report: "The recommended retry configuration adds up to [N]ms to worst-case latency. If the latency budget is [M]ms, consider reducing max attempts or using a hedged request pattern instead."
- **When the team has no experience with the recommended library:** Report: "The team has not used [library] before. Recommend starting with a single non-critical dependency as a pilot, with a production bake time of 2 weeks before rolling out to critical paths."
- **When existing resilience patterns use a different library than recommended:** Do not recommend switching libraries mid-project. Report: "The project already uses [existing library] for resilience. Recommend continuing with [existing library] for consistency, adapting the configuration recommendations to its API."
