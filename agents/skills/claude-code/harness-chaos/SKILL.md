# Harness Chaos

> Chaos engineering, fault injection, and resilience validation. Systematically introduces failures to verify that systems degrade gracefully, recover automatically, and maintain availability under real-world fault conditions.

## When to Use

- Validating resilience of a service before a production launch or major milestone
- Testing circuit breakers, retries, timeouts, and fallback mechanisms under failure
- Preparing for a game day exercise with defined failure scenarios
- NOT when the service has no resilience mechanisms implemented (implement them first with harness-resilience)
- NOT when testing application logic correctness (use harness-tdd or harness-integration-test instead)
- NOT when performing load or performance testing (use harness-load-testing instead)

## Process

### Phase 1: PLAN -- Define Failure Modes and Steady-State Hypotheses

1. **Map the system architecture.** Identify:
   - Services and their dependencies (databases, caches, message queues, third-party APIs)
   - Network boundaries (service-to-service calls, DNS resolution, load balancers)
   - Infrastructure components (Kubernetes pods, Docker containers, cloud services)
   - Data stores and their replication topology

2. **Define steady-state behavior.** Establish measurable indicators of normal operation:
   - Response time P50 and P99 (e.g., P99 < 500ms)
   - Error rate (e.g., < 0.1% 5xx responses)
   - Throughput (e.g., > 100 requests/second)
   - Business metrics (e.g., orders processed per minute, messages delivered)

3. **Enumerate failure modes.** For each dependency, define what can go wrong:
   - **Network failures:** latency injection, packet loss, DNS resolution failure, connection reset
   - **Service failures:** dependency returns 500, dependency is unreachable, dependency responds slowly
   - **Infrastructure failures:** pod crash, node failure, disk full, memory exhaustion
   - **Data failures:** database connection pool exhaustion, replication lag, cache eviction storm

4. **Scope the blast radius.** For each experiment, define:
   - **Target:** which specific service or instance is affected
   - **Duration:** how long the fault persists (start small: 30 seconds to 2 minutes)
   - **Magnitude:** what percentage of traffic or instances are affected
   - **Abort conditions:** when to immediately stop the experiment (e.g., customer-visible error rate > 5%)

5. **Prioritize experiments by risk and value.** Start with:
   - High likelihood, high impact failures (database connection loss, primary cache failure)
   - Failures with existing but untested resilience mechanisms (circuit breakers, retries)
   - Failures that have caused production incidents historically

6. **Document the experiment plan.** For each experiment, write:
   - Hypothesis: "When [fault] is injected into [target], the system [expected behavior]"
   - Steady-state metric: what to monitor
   - Abort criteria: when to terminate the experiment
   - Rollback procedure: how to immediately restore normal operation

### Phase 2: INJECT -- Apply Fault Injection

1. **Select the chaos tooling.** Based on the infrastructure:
   - **Chaos Toolkit:** framework-agnostic, declarative experiment definitions (JSON/YAML)
   - **Gremlin:** SaaS platform for enterprise chaos engineering
   - **Litmus:** Kubernetes-native chaos engineering
   - **Toxiproxy:** network-level fault injection proxy
   - **tc (traffic control):** Linux kernel network delay/loss injection
   - **Custom middleware:** application-level fault injection via feature flags or interceptors

2. **Configure the experiment.** Write the experiment definition:
   - Steady-state probe: how to verify normal operation before and after
   - Fault action: what fault to inject (latency, error, crash, resource exhaustion)
   - Rollback action: how to undo the fault if the experiment must abort
   - Duration and magnitude parameters

3. **Verify the pre-experiment steady state.** Before injecting any fault:
   - Run the steady-state probe and confirm it passes
   - Record baseline metrics (latency, error rate, throughput)
   - Confirm monitoring and alerting are active and visible to the experiment operator

4. **Inject the fault.** Execute the experiment:
   - Start with the smallest blast radius (single instance, short duration)
   - Monitor real-time metrics during injection
   - Be prepared to abort immediately if abort criteria are met

5. **Verify the abort mechanism works.** Before running experiments with larger blast radius:
   - Test that the rollback action successfully removes the injected fault
   - Confirm the system returns to steady state after rollback
   - Measure recovery time

### Phase 3: OBSERVE -- Monitor System Behavior Under Fault

1. **Collect metrics during the experiment.** Capture:
   - Response latency distribution (P50, P95, P99) for the affected service and its consumers
   - Error rates (HTTP status codes, exception counts, queue dead letters)
   - Circuit breaker state transitions (closed, open, half-open)
   - Retry counts and backoff behavior
   - Resource utilization (CPU, memory, connections, threads)

2. **Verify the steady-state hypothesis.** Compare observed metrics against the hypothesis:
   - **Hypothesis holds:** the system degraded gracefully as expected. Record as a successful experiment.
   - **Hypothesis violated:** the system behaved worse than expected. This is a finding. Record the specific deviation.

3. **Check for cascading failures.** Monitor downstream services:
   - Did the fault in service A cause service B to fail?
   - Did retry storms amplify the failure?
   - Did the load balancer route traffic away from the faulty instance?
   - Did the circuit breaker open before the caller's timeout?

4. **Record the timeline.** Document:
   - T+0: fault injected
   - T+N: first detection by monitoring/alerting
   - T+N: circuit breaker opens (if applicable)
   - T+N: system reaches degraded but stable state
   - T+N: fault removed
   - T+N: system returns to full steady state (recovery time)

5. **Terminate the experiment.** Remove the injected fault and verify:
   - The system returns to steady state within the expected recovery time
   - No data loss or corruption occurred during the experiment
   - All queued/retried operations complete successfully

### Phase 4: IMPROVE -- Analyze Findings and Strengthen Resilience

1. **Classify findings.** For each experiment:
   - **Passed:** system behavior matched the hypothesis. No action needed.
   - **Finding -- minor:** system recovered but slower than expected. Add to backlog.
   - **Finding -- major:** system experienced partial outage or data issue. Immediate action required.
   - **Finding -- critical:** cascading failure or data loss. Stop experiments and prioritize fix.

2. **Recommend resilience improvements.** For each finding:
   - Missing circuit breaker: implement circuit breaker with appropriate thresholds
   - Insufficient timeout: reduce timeout to prevent thread pool exhaustion
   - No fallback: implement graceful degradation (cached response, default value, feature flag)
   - Retry storm: implement exponential backoff with jitter and retry budget
   - No health check: add readiness/liveness probes that detect the specific failure mode

3. **Update runbooks and incident response documentation.** For each experiment:
   - Add the failure mode to the incident response playbook
   - Document the detection time, recovery procedure, and expected recovery time
   - Update alerting thresholds if monitoring did not detect the failure promptly

4. **Plan follow-up experiments.** Based on findings:
   - Re-run failed experiments after resilience improvements are implemented
   - Increase blast radius for successful experiments (from single instance to multiple instances)
   - Combine faults (e.g., database slowdown plus cache failure simultaneously)

5. **Run `harness validate`.** Confirm the project passes all harness checks after any code changes made for resilience improvements.

6. **Generate an experiment report.** Summarize:
   - Experiments run, hypotheses tested, and pass/fail outcomes
   - Findings with severity classification
   - Resilience improvements recommended or implemented
   - Recovery time measurements
   - Recommended next experiments

### Graph Refresh

If a knowledge graph exists at `.harness/graph/`, refresh it after code changes to keep graph queries accurate:

```
harness scan [path]
```

## Harness Integration

- **`harness validate`** -- Run in IMPROVE phase after resilience changes are implemented. Confirms project health.
- **`harness check-deps`** -- Run after INJECT phase setup to verify chaos tooling dependencies do not leak into production bundles.
- **`emit_interaction`** -- Used at checkpoints to present experiment plans for human approval before fault injection, and to present findings for prioritization.
- **Grep** -- Used in PLAN phase to find circuit breaker configurations, retry policies, timeout settings, and fallback implementations.
- **Glob** -- Used to locate infrastructure configuration files, Kubernetes manifests, and Docker Compose definitions.

## Success Criteria

- Every critical dependency has at least one chaos experiment testing its failure mode
- Steady-state hypotheses are defined with measurable metrics before experiments run
- The system degrades gracefully under every tested fault (no cascading failures, no data loss)
- Recovery time after fault removal is measured and meets the defined SLA
- Findings are documented with severity, root cause, and recommended fix
- Abort mechanisms are tested and confirmed functional before expanding blast radius
- `harness validate` passes after resilience improvements

## Examples

### Example: Chaos Toolkit Experiment for Database Latency

**PLAN -- Experiment definition:**

```json
{
  "title": "Database latency does not cause cascading timeout failures",
  "description": "Inject 2-second latency on PostgreSQL connections and verify the order service responds within 5 seconds using cached data",
  "steady-state-hypothesis": {
    "title": "Order service responds within SLA",
    "probes": [
      {
        "type": "probe",
        "name": "order-api-responds",
        "tolerance": true,
        "provider": {
          "type": "http",
          "url": "http://localhost:3000/api/orders/health",
          "timeout": 5
        }
      }
    ]
  },
  "method": [
    {
      "type": "action",
      "name": "inject-db-latency",
      "provider": {
        "type": "process",
        "path": "toxiproxy-cli",
        "arguments": "toxic add -t latency -a latency=2000 postgresql"
      }
    },
    {
      "type": "probe",
      "name": "check-order-response-time",
      "provider": {
        "type": "http",
        "url": "http://localhost:3000/api/orders?limit=10",
        "timeout": 5
      }
    }
  ],
  "rollbacks": [
    {
      "type": "action",
      "name": "remove-db-latency",
      "provider": {
        "type": "process",
        "path": "toxiproxy-cli",
        "arguments": "toxic remove -n inject-db-latency_latency_downstream postgresql"
      }
    }
  ]
}
```

### Example: Litmus Chaos for Kubernetes Pod Failure

**INJECT -- Pod kill experiment:**

```yaml
# litmus/pod-kill-experiment.yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: order-service-pod-kill
  namespace: staging
spec:
  appinfo:
    appns: staging
    applabel: app=order-service
    appkind: deployment
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: '60'
            - name: CHAOS_INTERVAL
              value: '10'
            - name: FORCE
              value: 'false'
            - name: PODS_AFFECTED_PERC
              value: '50'
```

**OBSERVE -- Expected behavior timeline:**

```
T+0s:   Fault injected - 50% of order-service pods killed
T+3s:   Kubernetes detects pod failure, starts replacement pods
T+5s:   Load balancer routes traffic to surviving pods
T+8s:   Response latency increases from 50ms to 200ms (surviving pods absorb load)
T+15s:  Replacement pods pass readiness probe, rejoin the pool
T+20s:  Latency returns to baseline (50ms)
T+60s:  Experiment ends

Result: PASSED - System maintained availability throughout.
        P99 latency spiked to 450ms (within 500ms SLA).
        Zero 5xx errors observed. No data loss.
```

## Gates

- **No chaos experiments without abort criteria.** Every experiment must define conditions under which it is immediately terminated. Running an experiment that you cannot stop is reckless, not engineering.
- **No production experiments without staging validation.** Run every experiment in staging first. Only after the experiment passes in staging and the team is confident in the abort mechanism should it be considered for production.
- **No expanding blast radius without successful small-scope runs.** Start with a single instance or a small percentage of traffic. Only increase scope after the smaller experiment passes and recovery is confirmed.
- **No experiments during incidents or peak traffic.** Chaos experiments must not be run when the system is already under stress or during known high-traffic periods. Schedule experiments during low-traffic windows.

## Escalation

- **When an experiment causes unexpected data loss or corruption:** Immediately abort, restore from backup, and halt all chaos experiments. Conduct a post-mortem to understand why the data protection mechanisms failed. Do not resume experiments until the data safety gap is addressed.
- **When monitoring does not detect the injected fault:** This is a finding -- the monitoring is inadequate. Do not interpret "no alerts" as "the system handled it well." Escalate to the observability team to add detection for the specific failure mode before re-running the experiment.
- **When the team is reluctant to run chaos experiments:** Start with the least risky experiment in a non-production environment. Use the results to demonstrate value. Chaos engineering requires organizational buy-in; do not force it.
- **When cascading failures are discovered:** This is a critical finding. The service mesh or dependency chain lacks isolation. Escalate immediately with a recommendation for circuit breakers, bulkheads, or service mesh fault injection policies.
