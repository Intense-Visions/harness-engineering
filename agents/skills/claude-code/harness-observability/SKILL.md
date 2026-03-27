# Harness Observability

> Structured logging, metrics, distributed tracing, and alerting strategy. The three pillars of observability, assessed and designed for production readiness.

## When to Use

- When designing or reviewing observability instrumentation for a service
- When auditing logging, metrics, or tracing coverage gaps
- When defining SLIs, SLOs, and alerting strategies for a new feature
- NOT for application performance benchmarking (use harness-perf)
- NOT for security-focused log analysis (use harness-security-review)
- NOT for incident response procedures (use harness-incident-response)

## Process

### Phase 1: DETECT -- Identify Existing Instrumentation

1. **Scan for observability libraries.** Check package manifests for instrumentation dependencies:
   - **Logging:** winston, pino, bunyan, log4js, structlog, serilog, zap, logrus
   - **Metrics:** prom-client, micrometer, statsd-client, @opentelemetry/sdk-metrics
   - **Tracing:** @opentelemetry/sdk-trace-node, dd-trace, jaeger-client, zipkin
   - **Platforms:** @datadog/browser-rum, newrelic, @sentry/node, elastic-apm-node

2. **Locate instrumentation code.** Search for logger, metrics, and tracing initialization:
   - Logger configuration files (log levels, formatters, transports)
   - Metrics registry and custom metric definitions
   - Tracer initialization and span creation patterns
   - Middleware for automatic HTTP instrumentation

3. **Detect collector and exporter configuration.** Look for:
   - OpenTelemetry Collector config (`otel-collector-config.yaml`)
   - Prometheus scrape configuration (`prometheus.yml`)
   - Grafana dashboards (`grafana/dashboards/`)
   - Datadog agent configuration (`datadog.yaml`)
   - Fluentd or Fluent Bit configuration for log forwarding

4. **Identify alerting configuration.** Search for:
   - Prometheus alerting rules (`alert.rules.yml`)
   - Grafana alert definitions
   - PagerDuty, Opsgenie, or Slack integration configs
   - SLO definitions in monitoring-as-code format

5. **Present detection summary:**

   ```
   Observability Detection:
     Logging: pino (structured JSON) -- 12 logger instances found
     Metrics: prom-client -- 8 custom metrics defined
     Tracing: @opentelemetry/sdk-trace-node -- initialized in src/tracing.ts
     Collector: OpenTelemetry Collector -> Grafana Cloud
     Alerting: 3 Prometheus alert rules, Slack integration
   ```

---

### Phase 2: AUDIT -- Evaluate Coverage and Quality

1. **Audit logging quality.** Evaluate each logger usage for:
   - **Structured format:** JSON output with consistent field names, not string concatenation
   - **Log levels:** Appropriate use of error, warn, info, debug (not everything at info)
   - **Context fields:** Request ID, user ID, operation name included in log entries
   - **Correlation IDs:** Trace ID propagated through log entries for cross-service correlation
   - **Sensitive data:** No PII, credentials, or tokens logged
   - **Error logging:** Stack traces included for errors, not just error messages

2. **Audit metrics coverage.** Check for standard metrics:
   - **RED metrics:** Request rate, error rate, duration for every HTTP endpoint
   - **USE metrics:** Utilization, saturation, errors for system resources
   - **Custom business metrics:** Domain-specific counters and gauges
   - **Histogram buckets:** Appropriate bucket boundaries for latency histograms
   - **Label cardinality:** No high-cardinality labels (user ID, request ID as metric labels)

3. **Audit tracing implementation.** Verify:
   - **Span creation:** Entry points create root spans, downstream calls create child spans
   - **Context propagation:** Trace context flows across HTTP boundaries (W3C or B3 headers)
   - **Span attributes:** Meaningful attributes set on spans (not empty spans)
   - **Error recording:** Exceptions recorded on spans with status codes
   - **Sampling strategy:** Configured and appropriate (not sampling 100% in production)

4. **Audit alerting effectiveness.** Check each alert for:
   - **Actionability:** Does the alert tell the on-call engineer what to do?
   - **Signal quality:** Based on symptoms (error rate) not causes (CPU usage)
   - **Thresholds:** Based on SLO burn rate, not arbitrary values
   - **Runbook link:** Each alert has a link to a runbook or troubleshooting guide
   - **Routing:** Alerts route to the correct team and escalation path

5. **Score each pillar and identify gaps:**

   ```
   Observability Audit:
     Logging:  7/10 -- structured, but missing correlation IDs in 4 services
     Metrics:  5/10 -- RED metrics partial, no business metrics
     Tracing:  8/10 -- good coverage, sampling needs tuning
     Alerting: 3/10 -- only 3 rules, no SLO-based alerts, no runbooks
   ```

---

### Phase 3: DESIGN -- Recommend Instrumentation Strategy

1. **Design logging strategy.** Recommend:
   - Standard log format with required fields (timestamp, level, service, traceId, message)
   - Logger factory that injects correlation context automatically
   - Log level configuration per environment (debug in dev, info in production)
   - Log aggregation pipeline (application -> collector -> storage -> query)
   - Retention policy per environment

2. **Design metrics strategy.** Recommend:
   - Standard RED metrics for every HTTP endpoint using middleware
   - Custom business metrics aligned with product KPIs
   - Histogram bucket configuration based on expected latency distribution
   - Metric naming convention following Prometheus best practices (`http_request_duration_seconds`)
   - Dashboard templates for standard service views

3. **Design tracing strategy.** Recommend:
   - Automatic instrumentation for HTTP, database, and message queue operations
   - Manual span creation for business-critical code paths
   - Sampling strategy (head-based for development, tail-based for production)
   - Baggage propagation for cross-cutting concerns (tenant ID, feature flags)
   - Trace-to-log correlation via trace ID injection

4. **Define SLIs and SLOs.** For each service endpoint:
   - **Availability SLI:** Proportion of successful requests (non-5xx)
   - **Latency SLI:** Proportion of requests faster than threshold (p99 < 500ms)
   - **SLO target:** 99.9% availability, 99% latency within budget
   - **Error budget:** Calculation and burn rate alerting
   - **SLO dashboard:** Visual budget remaining over rolling window

5. **Design alerting strategy.** Recommend:
   - Multi-window, multi-burn-rate alerts based on SLOs
   - Page-worthy alerts (high burn rate) vs. ticket-worthy alerts (slow burn)
   - Alert grouping to reduce noise (one alert per service, not per instance)
   - Escalation paths with timeouts
   - Regular alert review cadence (monthly) to retire noisy alerts

---

### Phase 4: VALIDATE -- Verify Instrumentation Correctness

1. **Validate log output.** Check that logs from a test run:
   - Parse as valid JSON (if structured logging is configured)
   - Contain required fields (timestamp, level, service name)
   - Include trace IDs when tracing is active
   - Do not contain sensitive data (grep for common patterns: password, token, secret)
   - Use appropriate log levels (no error-level logs for normal operations)

2. **Validate metric exposition.** Verify:
   - Metrics endpoint (`/metrics`) is accessible and returns Prometheus format
   - All declared custom metrics appear in the output
   - Histogram buckets are populated with reasonable values
   - No high-cardinality label combinations (check label count)
   - Counter values increment correctly (not resetting unexpectedly)

3. **Validate trace propagation.** Verify end-to-end:
   - A request to the entry service generates a trace visible in the tracing backend
   - Child spans appear for downstream service calls
   - Span attributes are populated with expected values
   - Error spans have appropriate status and exception recording
   - Sampling is working as configured (not dropping all traces or keeping all)

4. **Validate alerting rules.** Check:
   - Alert expressions are syntactically valid (PromQL, LogQL)
   - Alert thresholds fire on historical data that represents real incidents
   - Alert routing sends to the correct channel or pager
   - Runbook links resolve to actual documentation

5. **Generate observability report:**

   ```
   Observability Validation: [PASS/WARN/FAIL]

   Logging: PASS (structured, correlated, no PII detected)
   Metrics: WARN (RED metrics present, missing business metrics)
   Tracing: PASS (propagation verified, sampling at 10%)
   Alerting: FAIL (no SLO-based alerts, 2 of 3 rules missing runbooks)

   Priority actions:
     1. Define SLOs for /api/orders and /api/payments endpoints
     2. Add multi-burn-rate alerts based on SLO error budget
     3. Write runbooks for existing alerts
     4. Add order_total and payment_success_rate business metrics
   ```

---

## Harness Integration

- **`harness skill run harness-observability`** -- Primary invocation for observability audit.
- **`harness validate`** -- Run after instrumentation changes to verify project health.
- **`harness check-deps`** -- Verify observability library dependencies are installed.
- **`emit_interaction`** -- Present audit results and SLO design recommendations.

## Success Criteria

- All three observability pillars (logging, metrics, tracing) are assessed
- Coverage gaps are identified with specific remediation recommendations
- SLI/SLO definitions are provided for critical service endpoints
- Alerting strategy is evaluated for actionability and signal quality
- No sensitive data detected in log output
- Correlation between logs and traces is verified

## Examples

### Example: Express.js API with OpenTelemetry

```
Phase 1: DETECT
  Logging: pino with pino-http middleware
  Metrics: @opentelemetry/sdk-metrics -> Prometheus
  Tracing: @opentelemetry/sdk-trace-node -> Jaeger
  Collector: OTel Collector (otel-collector-config.yaml)
  Alerting: 5 Prometheus rules in monitoring/alerts.yml

Phase 2: AUDIT
  Logging: 8/10 -- structured JSON, trace IDs present, missing request body size
  Metrics: 6/10 -- http_request_duration_seconds present, missing queue depth
             and business metrics (orders_created_total)
  Tracing: 9/10 -- auto-instrumented HTTP + pg + Redis, manual spans on
             checkout flow
  Alerting: 4/10 -- static thresholds, no SLO burn rate, 2 missing runbooks

Phase 3: DESIGN
  SLOs recommended:
    - POST /api/orders: 99.9% availability, p99 < 800ms
    - GET /api/products: 99.95% availability, p99 < 200ms
  Alerting: Replace static "error rate > 5%" with multi-window burn rate
  Metrics: Add orders_created_total, cart_abandonment_rate gauges
  Logging: Add request/response body size for capacity planning

Phase 4: VALIDATE
  Log output: PASS (valid JSON, no PII)
  Metrics endpoint: PASS (all custom metrics present)
  Trace propagation: PASS (end-to-end verified)
  Alert rules: WARN (valid PromQL, but thresholds not SLO-based)
  Result: WARN -- alerting strategy needs SLO alignment
```

### Example: Go Microservices with Datadog

```
Phase 1: DETECT
  Logging: zap (structured) across 4 services
  Metrics: Datadog dogstatsd client
  Tracing: dd-trace-go with automatic HTTP/gRPC instrumentation
  Collector: Datadog Agent (datadog.yaml in k8s/)
  Alerting: 12 monitors in Datadog (Terraform-managed)

Phase 2: AUDIT
  Logging: 9/10 -- consistent structured format, correlation IDs, no PII
  Metrics: 7/10 -- RED metrics present, custom counters for business events,
             but missing histogram for gRPC call duration
  Tracing: 8/10 -- HTTP and gRPC instrumented, database spans present,
             Redis spans missing
  Alerting: 6/10 -- good coverage but static thresholds, no error budgets

Phase 3: DESIGN
  1. Add dd-trace-go Redis integration for complete trace picture
  2. Add grpc_server_handling_seconds histogram
  3. Define SLOs in Datadog for top 5 endpoints
  4. Convert 4 highest-priority monitors to SLO burn rate alerts
  5. Add Datadog SLO dashboard for team visibility

Phase 4: VALIDATE
  Log output: PASS
  Metrics: WARN (missing gRPC histogram)
  Traces: WARN (Redis spans missing)
  Alerts: WARN (no SLO-based alerts)
  Result: WARN -- 3 instrumentation gaps, alerting needs SLO alignment
```

## Gates

- **No sensitive data in logs.** If PII, credentials, or tokens are detected in log output, it is a blocking finding. The logging configuration must sanitize or redact sensitive fields before any other improvements are made.
- **No high-cardinality metric labels.** Metric labels with unbounded values (user IDs, request IDs, timestamps) cause storage explosion and query timeouts. This is a blocking finding.
- **No alerting without runbooks.** Production alerts that lack a runbook link are incomplete. Every page-worthy alert must have actionable documentation.
- **No tracing without context propagation.** Traces that do not propagate context across service boundaries provide incomplete pictures and mislead investigations. Broken propagation is a blocking finding.

## Escalation

- **When observability libraries conflict:** Some combinations (e.g., dd-trace and OTel auto-instrumentation) cause duplicate spans or metric conflicts. Recommend choosing one provider and removing the other. If migration is needed, present a phased approach.
- **When sampling drops critical traces:** If tail-based sampling is misconfigured, critical error traces may be dropped. Recommend always-sample rules for error responses and critical code paths, with probabilistic sampling for normal traffic.
- **When metric cardinality is already out of control:** Do not attempt to fix retroactively in the metrics backend. Recommend adding new metrics with correct labels and deprecating the high-cardinality ones. Set a timeline for removal.
- **When no observability infrastructure exists:** This is a design-from-scratch scenario. Start with structured logging (lowest barrier), then add metrics (RED for HTTP endpoints), then tracing. Do not attempt all three at once.
