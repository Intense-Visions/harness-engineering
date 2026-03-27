# Harness Incident Response

> Runbook generation, postmortem analysis, and SLO/SLA tracking. Diagnoses incidents by tracing symptoms through services, produces structured postmortems, and maintains error budget accounting.

## When to Use

- After a production incident to generate a structured postmortem with timeline and action items
- To create or audit runbooks for critical services and failure scenarios
- To define, track, or adjust SLOs/SLAs and monitor error budget consumption
- NOT for real-time incident coordination (use PagerDuty, OpsGenie, or incident.io for live response)
- NOT for infrastructure provisioning or remediation (use harness-infrastructure-as-code)
- NOT for performance benchmarking (use harness-load-testing for capacity planning)

## Process

### Phase 1: ASSESS -- Determine Scope and Severity

1. **Identify the incident signal.** Scan available evidence to determine what triggered the investigation:
   - Check for existing incident reports in `docs/incidents/` or `docs/postmortems/`
   - Look for recent error spikes in log files, monitoring configs, or alerting rules
   - Review recent deployments via `git log --oneline --since="48 hours ago"` for correlated changes

2. **Map affected services.** Trace the blast radius from the incident signal:
   - Identify the originating service from error messages or alert metadata
   - Walk dependency chains using import graphs or service manifests (`docker-compose.yml`, `kubernetes/`, service mesh configs)
   - List all downstream services that depend on the affected component

3. **Classify severity.** Apply the project's severity matrix if one exists in `docs/runbooks/severity-matrix.md`. Otherwise, use standard classification:
   - **SEV1:** Complete service outage, data loss, or security breach affecting all users
   - **SEV2:** Major feature degradation affecting a significant subset of users
   - **SEV3:** Minor feature degradation with workaround available
   - **SEV4:** Cosmetic issue or internal tooling degradation

4. **Establish timeline boundaries.** Determine:
   - When the incident started (first error, first alert, or first user report)
   - When it was detected (MTTD -- Mean Time to Detect)
   - When mitigation began
   - When the incident was resolved (MTTR -- Mean Time to Recover)

5. **Check for existing runbooks.** Search `docs/runbooks/` and `runbooks/` for procedures matching the affected service or failure mode. If a runbook exists, evaluate whether it was followed and whether it was effective.

---

### Phase 2: INVESTIGATE -- Trace Root Cause

1. **Correlate with recent changes.** Run `git log --oneline --since="7 days ago"` and cross-reference commits with the incident timeline. Flag commits that touched affected services or their dependencies.

2. **Analyze error patterns.** Search the codebase for error handling related to the failure:
   - Grep for error messages, exception types, or error codes mentioned in the incident
   - Check retry logic, timeout configurations, and circuit breaker states
   - Identify whether the failure was transient (timeout, network) or persistent (logic error, data corruption)

3. **Trace data flow.** Map the request path from entry point to failure point:
   - Identify API endpoints, message queues, or cron jobs involved
   - Check database queries and external API calls along the path
   - Look for missing validation, unhandled edge cases, or race conditions

4. **Identify contributing factors.** Distinguish between root cause and contributing factors:
   - Root cause: the single change or condition that directly caused the failure
   - Contributing factors: conditions that allowed the failure to reach production (missing tests, inadequate monitoring, deployment without canary)

5. **Validate the hypothesis.** Confirm the root cause by checking:
   - Does reverting the identified change (or simulating the revert) resolve the issue?
   - Does the failure reproduce under the identified conditions?
   - Are there other incidents with the same root cause pattern?

---

### Phase 3: DOCUMENT -- Generate Artifacts

1. **Generate the postmortem report.** Create a structured document in `docs/postmortems/YYYY-MM-DD-<slug>.md` with these sections:
   - **Summary:** One-paragraph description of what happened, impact, and duration
   - **Timeline:** Chronological list of events from first signal to resolution
   - **Root Cause:** Clear statement of what went wrong and why
   - **Contributing Factors:** Conditions that enabled the failure
   - **Impact:** User-facing impact, data impact, SLO impact, revenue impact if applicable
   - **Detection:** How the incident was detected and time to detection
   - **Mitigation:** Steps taken to resolve the incident
   - **Action Items:** Numbered list with owner, priority, and due date

2. **Create or update runbooks.** For each failure mode identified:
   - If no runbook exists, create one in `docs/runbooks/<service>-<failure-mode>.md`
   - Structure: Symptoms, Diagnosis Steps, Mitigation Steps, Escalation Path, Recovery Verification
   - Include concrete commands (kubectl, database queries, API calls) not just prose descriptions
   - Reference monitoring dashboards and alert names

3. **Update the incident log.** If `docs/incidents/index.md` exists, append the new incident with date, severity, MTTR, and link to the postmortem.

4. **Tag related code.** Add or update `// INCIDENT-YYYY-MM-DD: <description>` comments at the code locations involved in the root cause. This creates a searchable history of incident-prone code.

---

### Phase 4: IMPROVE -- SLO Adjustments and Prevention

1. **Calculate SLO impact.** If `slo.yaml` or equivalent SLO definitions exist:
   - Determine how much error budget the incident consumed
   - Calculate remaining error budget for the current window
   - If error budget is exhausted, flag that feature development should pause for reliability work

2. **Evaluate alerting effectiveness.** For each alert that fired (or should have fired):
   - Was the alert timely? Compare alert time to incident start time
   - Was the alert actionable? Did it point to the right service and include enough context?
   - Were there false negatives? Identify monitoring gaps that should have caught the issue earlier

3. **Propose SLO adjustments.** Based on the incident analysis:
   - If the SLO was violated but the impact was acceptable, the SLO may be too tight
   - If the SLO was not violated but users were impacted, the SLO may be too loose
   - Recommend specific SLI (Service Level Indicator) thresholds with justification

4. **Generate preventive action items.** Categorize actions by type:
   - **Code fixes:** Specific bugs or missing validations to address
   - **Testing gaps:** Missing integration tests, chaos tests, or load tests to add
   - **Monitoring improvements:** New alerts, dashboards, or SLIs to implement
   - **Process improvements:** Deployment safeguards, runbook updates, or on-call training
   - **Architecture changes:** Circuit breakers, bulkheads, or redundancy to add

5. **Produce the improvement summary.** Output a prioritized action list with effort estimates and expected impact on MTTD and MTTR.

---

## Harness Integration

- **`harness skill run harness-incident-response`** -- Primary CLI entry point. Runs all four phases.
- **`harness validate`** -- Run after generating documents to ensure project structure is intact.
- **`harness check-deps`** -- Verify service dependency declarations match the incident trace.
- **`emit_interaction`** -- Used at severity classification (checkpoint:decision) to confirm severity with the operator before proceeding.
- **`Glob`** -- Discover existing runbooks, postmortems, and SLO definitions.
- **`Grep`** -- Search for error patterns, alert configurations, and incident-related code comments.
- **`Write`** -- Generate postmortem reports and runbook documents.
- **`Edit`** -- Update existing runbooks and incident indexes.

## Success Criteria

- Postmortem document is complete with all required sections (summary, timeline, root cause, action items)
- Timeline includes MTTD and MTTR calculations with specific timestamps
- Root cause is a specific, falsifiable statement (not "the system failed")
- Action items have owners, priorities, and due dates
- Runbooks contain concrete commands, not just descriptive prose
- SLO impact is quantified against the error budget when SLO definitions exist

## Examples

### Example: Node.js API Timeout Incident with Datadog Alerts

```
Phase 1: ASSESS
  Signal: Datadog alert "api-gateway p99 latency > 2000ms" fired at 14:32 UTC
  Affected: api-gateway -> user-service -> PostgreSQL
  Severity: SEV2 (major degradation, 40% of requests timing out)
  MTTD: 4 minutes (alert fired 4 min after first error)
  MTTR: 47 minutes (resolved at 15:19 UTC)

Phase 2: INVESTIGATE
  Correlated change: commit abc123 "add user preferences join" deployed at 14:25 UTC
  Root cause: N+1 query in GET /api/users/:id/preferences — new LEFT JOIN
    on unindexed column `preferences.user_id` caused full table scan
  Contributing factors:
    - No query performance test for the preferences endpoint
    - Missing database index on preferences.user_id
    - No circuit breaker between api-gateway and user-service

Phase 3: DOCUMENT
  Created: docs/postmortems/2026-03-15-user-service-timeout.md
  Created: docs/runbooks/user-service-database-slow-query.md
  Updated: docs/incidents/index.md

Phase 4: IMPROVE
  SLO impact: Consumed 12% of monthly error budget (88% remaining)
  Action items:
    1. [P0] Add index on preferences.user_id (owner: @backend, due: 2026-03-16)
    2. [P1] Add query execution time assertions to integration tests (owner: @backend, due: 2026-03-22)
    3. [P1] Add circuit breaker on api-gateway -> user-service (owner: @platform, due: 2026-03-22)
    4. [P2] Add Datadog query performance monitor for user-service (owner: @sre, due: 2026-03-29)
```

### Example: Kubernetes Pod CrashLoopBackOff with PagerDuty Escalation

```
Phase 1: ASSESS
  Signal: PagerDuty incident #4521 — payment-service pods in CrashLoopBackOff
  Affected: payment-service -> Stripe API -> order-service (downstream)
  Severity: SEV1 (payment processing completely down)
  MTTD: 2 minutes (PagerDuty auto-detected from Kubernetes health checks)
  MTTR: 23 minutes

Phase 2: INVESTIGATE
  Root cause: Environment variable STRIPE_WEBHOOK_SECRET rotated in Vault
    but payment-service pods were not restarted to pick up new value.
    Stripe signature verification failed on all incoming webhooks, causing
    panic in the webhook handler (no error recovery).
  Contributing factors:
    - Vault secret rotation did not trigger pod restart
    - Webhook handler used panic instead of returning error
    - No runbook for secret rotation procedures

Phase 3: DOCUMENT
  Created: docs/postmortems/2026-03-20-payment-service-crashloop.md
  Created: docs/runbooks/payment-service-secret-rotation.md
  Created: docs/runbooks/payment-service-stripe-webhook-failure.md
  Updated: docs/incidents/index.md

Phase 4: IMPROVE
  SLO impact: Consumed 100% of weekly error budget. Feature freeze recommended.
  Action items:
    1. [P0] Add Vault agent sidecar with auto-restart on secret change (owner: @platform)
    2. [P0] Replace panic with error return in webhook handler (owner: @payments)
    3. [P1] Add synthetic Stripe webhook test to canary suite (owner: @payments)
    4. [P2] Create secret rotation runbook for all services (owner: @sre)
```

## Gates

- **No postmortem without a root cause statement.** A postmortem that says "cause unknown" is incomplete. If the root cause cannot be determined, the postmortem must document what was investigated, what was ruled out, and what additional data is needed. Do not close the investigation.
- **No action items without owners.** Every action item must have an assigned owner and a due date. Unowned action items are never completed. If no owner can be identified, escalate to the team lead.
- **No severity downgrade without justification.** If a severity is reclassified during investigation, the reason must be documented in the postmortem timeline. Severity downgrades without evidence indicate pressure to minimize, not genuine reassessment.
- **No skipping the improvement phase.** Documentation without follow-through produces shelf-ware. The improvement phase must produce at least one concrete, actionable item per contributing factor identified.

## Escalation

- **When root cause cannot be determined from code alone:** The incident may require production logs, metrics, or traces that are not available in the codebase. Report: "Root cause analysis requires access to [specific observability data]. Recommend reviewing [Datadog/Grafana/CloudWatch] dashboards for the incident window."
- **When the incident reveals a systemic architecture issue:** A single postmortem action item is insufficient. Report: "This incident pattern indicates a systemic issue with [description]. Recommend a dedicated architecture review using harness-architecture-advisor."
- **When SLO definitions do not exist:** Error budget calculation is impossible without SLOs. Report: "No SLO definitions found. Recommend establishing baseline SLOs before the next incident review. See the SLO starter template in docs/runbooks/slo-template.yaml."
- **When multiple teams are involved in the blast radius:** A single postmortem owner may not have visibility into all contributing factors. Report: "This incident spans [N] services owned by [teams]. Recommend a joint postmortem review with representatives from each team."
