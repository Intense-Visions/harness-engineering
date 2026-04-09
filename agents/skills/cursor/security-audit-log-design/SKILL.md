# Audit Log Design

> Log the who, what, when, where, and outcome of every security-relevant event in a
> structured, tamper-evident format that enables both real-time detection and forensic
> reconstruction

## When to Use

- Designing the logging infrastructure for a new application or service
- Adding security event logging to an existing system that lacks audit trails
- Preparing for SOC2, ISO 27001, HIPAA, or PCI-DSS compliance audits
- Investigating a security incident and discovering logging gaps
- Choosing between application-level and infrastructure-level audit logging
- Designing tamper-evident log storage for high-assurance environments

## Threat Context

Attackers who gain access to a system routinely attempt to cover their tracks by deleting or
modifying logs. Log tampering is not theoretical -- it is standard attacker tradecraft:

- **SolarWinds (2020)**: The attackers specifically targeted logging and monitoring
  infrastructure to evade detection, disabling security tools and modifying logs to remove
  evidence of their presence. They remained undetected for 9+ months.
- **Detection time without logging**: The IBM/Ponemon Cost of a Data Breach Report
  consistently finds that organizations without adequate security logging take 200+ days to
  detect a breach. Organizations with security AI and automation (which depends on structured
  log data) detect breaches 108 days faster.
- **Compliance requirements**: SOC2 Trust Services Criteria CC7.2 requires monitoring of
  system components for anomalies. PCI-DSS Requirement 10 mandates audit trails for all
  access to cardholder data. HIPAA requires audit controls for electronic protected health
  information. ISO 27001 A.12.4 requires event logging, protection of log information, and
  administrator/operator logs. Failure to maintain adequate logs results in audit findings,
  regulatory penalties, and inability to investigate incidents.
- **Legal and forensic value**: Audit logs are legal evidence. In breach litigation,
  regulators and courts expect timestamped, tamper-evident records of what happened. Without
  them, the organization cannot demonstrate due diligence or reconstruct the incident
  timeline.

Logging is not optional overhead -- it is the immune system of the application. A system
without audit logging is a system where breaches are invisible.

## Instructions

1. **Define the security-relevant events that must be logged.** At minimum, capture these
   event categories:
   - **Authentication events**: Login success, login failure (with username attempted),
     logout, MFA challenge issued, MFA challenge success/failure, password change, password
     reset request, account lockout
   - **Authorization events**: Access granted, access denied, permission change, role
     assignment, role revocation, privilege escalation attempt
   - **Data access events**: Read of sensitive data (PII, financial, health), bulk data
     export, bulk query execution, data download
   - **Administrative actions**: User creation, user deletion, user modification, role
     creation, configuration change, feature flag change, deployment, certificate rotation
   - **System events**: Application startup, application shutdown, dependency failure,
     database migration, backup execution
   - **Anomalous events**: Rate limit triggered, input validation rejection, WAF block,
     unexpected error, authentication from new device/location

2. **Use a structured event format for every audit entry.** Every audit event must include
   these fields:
   - `timestamp`: ISO 8601 with timezone, always UTC (e.g., `2024-01-15T14:30:00.123Z`)
   - `event_type`: Enumerated, dot-separated category (e.g., `auth.login.success`,
     `authz.permission.denied`, `data.export.initiated`)
   - `actor`: Who performed the action -- user ID, service account name, or `system` for
     automated processes
   - `action`: The verb -- `create`, `read`, `update`, `delete`, `login`, `logout`,
     `export`, `deny`
   - `resource`: What was acted upon -- resource type and identifier (e.g., `user:u-12345`,
     `order:o-67890`, `config:feature-flags`)
   - `outcome`: `success` or `failure`, with `reason` for failures (e.g.,
     `insufficient_permissions`, `invalid_credentials`, `rate_limited`)
   - `source_ip`: The IP address of the request origin
   - `session_id`: Session or request correlation ID for linking related events
   - `metadata`: Additional context -- user agent, request path, changed fields for update
     operations, previous and new values for configuration changes

3. **Log at the application layer, not just infrastructure.** Infrastructure logs (web
   server access logs, firewall logs, load balancer logs) capture network-level events but
   miss application-level semantics. The infrastructure sees
   `GET /api/customers?limit=99999 200 OK`. The application knows "User 123 exported all
   50,000 customer records to CSV." Both are needed; the application event is far more
   actionable for security investigation. Implement audit logging as a first-class
   application concern, not an afterthought bolted onto HTTP middleware.

4. **Make logs tamper-evident.** An attacker who compromises the application server will
   attempt to delete or modify logs to cover their tracks. Tamper evidence ensures
   modifications are detectable:
   - **Write-once storage**: S3 Object Lock (Governance or Compliance mode), Azure Immutable
     Blob Storage, GCP Bucket Lock, WORM (Write Once Read Many) storage. Once written, log
     entries cannot be modified or deleted for the retention period.
   - **Hash chaining**: Each log entry includes
     `entry_hash = SHA-256(entry_data + previous_entry_hash)`. The first entry uses a known
     sentinel value. Any modification, deletion, or insertion of entries breaks the hash
     chain from that point forward.
   - **Real-time forwarding**: Forward logs to an independent, append-only log aggregator
     (Splunk, Elasticsearch/OpenSearch, CloudWatch Logs, Datadog) in real time via syslog,
     Fluentd, or direct API integration. The application server's local logs are not the
     sole copy.
   - **Digital signatures**: Sign log batches with a key held in an HSM or KMS. Provides
     non-repudiation -- the logs can be verified as authentic even if the logging
     infrastructure is later compromised.

5. **Never log secrets or PII unnecessarily.** Audit logs must not contain passwords, API
   keys, session tokens, credit card numbers, social security numbers, or other sensitive
   data. Log the fact that an action occurred, not the sensitive content. Correct: "User
   u-12345 updated their password at 2024-01-15T14:30:00Z." Incorrect: "User u-12345
   changed password from 'oldpass123' to 'newpass456'." For PII, log only the minimum needed
   for investigation -- user ID rather than full name and email, unless specific compliance
   requirements mandate otherwise. Implement log scrubbing as a safety net: regex-based
   filters that detect and redact patterns matching known secret formats before log entries
   are written.

6. **Define retention and archival policies aligned with compliance requirements.** Common
   minimums: SOC2 requires 1 year of audit log retention. PCI-DSS requires 1 year with 3
   months immediately accessible for analysis. HIPAA requires 6 years. GDPR does not specify
   a retention period but requires that retention be justified and proportionate. Archive
   older logs to cold storage (S3 Glacier, Azure Cool/Archive Blob) to manage costs, but
   ensure archived logs remain searchable and verifiable. Test restoration from cold storage
   regularly -- logs that cannot be retrieved when needed are equivalent to no logs.

7. **Alert on high-severity events in real time.** Logs that are only read during
   post-incident investigation provide forensic value but no detection value. Configure
   real-time alerts for: multiple failed login attempts from a single IP or against a single
   account (brute force, credential stuffing), privilege escalation events, access to
   sensitive data outside normal patterns (time of day, volume, geographic location),
   administrative actions from unusual source IPs, any `outcome: failure` on critical
   operations (payment processing, data export), and new device/location for privileged
   accounts. Route alerts to the security team's incident response channel (PagerDuty,
   Slack, email) with enough context to triage without reading raw logs.

## Details

- **The OWASP Logging Cheat Sheet event categories**: Authentication (success, failure,
  lockout), Authorization (access granted, denied, permission changes), Session management
  (creation, destruction, timeout, concurrent session detection), Input validation failures
  (rejected input, WAF blocks, malformed requests), Application errors (unhandled
  exceptions, dependency failures, timeout events), High-value transactions (financial
  operations, data exports, bulk operations, configuration changes). Use this as a starting
  checklist and add domain-specific events for your application.

- **Structured logging format example**: A complete JSON audit event:

  ```json
  {
    "timestamp": "2024-01-15T14:30:00.123Z",
    "event_type": "authz.permission.denied",
    "actor": { "user_id": "u-123", "session_id": "s-456", "service": "order-api" },
    "action": "delete",
    "resource": { "type": "order", "id": "o-789" },
    "outcome": "failure",
    "reason": "insufficient_permissions",
    "source_ip": "198.51.100.42",
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "request_id": "req-abc-def",
    "metadata": {
      "required_permission": "order:delete",
      "actual_permissions": ["order:read", "order:update"]
    }
  }
  ```

  Use an enumerated `event_type` taxonomy defined in code so events can be queried
  consistently across services. Avoid free-text event descriptions that vary between
  developers.

- **Tamper evidence with hash chaining in detail**: Each log entry includes:
  `entry_hash = SHA-256(canonical_json(entry_data) + previous_entry_hash)`. The first entry
  uses a well-known sentinel (e.g., `SHA-256("GENESIS")`) as the "previous hash."
  Verification: recompute the chain from any starting point. If any entry has been modified,
  deleted, or inserted, all subsequent hashes fail verification. Store periodic "anchor
  hashes" in an independent system (a separate database, a blockchain, a signed timestamping
  service) so that the integrity of the chain can be verified even if the primary log store
  is compromised. This technique is used by AWS CloudTrail log file integrity validation.

- **Log levels vs audit events -- they are different concerns**: Application log levels
  (DEBUG, INFO, WARN, ERROR) serve operational troubleshooting. Audit events record
  security-relevant business events regardless of severity. A successful login is not an
  "error" or a "warning" -- it is a security event that must be recorded. Implement audit
  logging as a separate subsystem with its own transport, storage, and retention. Do not
  rely on application log level configuration to control audit event emission -- changing the
  log level to WARN to reduce noise must never suppress security audit events.

## Anti-Patterns

1. **No logging of failed authentication attempts.** Failed logins are the single most
   important signal for detecting brute force attacks, credential stuffing campaigns, and
   account takeover attempts. An application that only logs successful logins is blind to the
   10,000 failed attempts that preceded the one successful compromise.

2. **Logging everything at DEBUG level in production.** Produces such volume that security
   events are buried in noise. Debug logging also risks exposing sensitive data -- request
   bodies containing passwords, internal state containing encryption keys, SQL queries
   containing user data. Use structured audit events for security concerns, not verbose debug
   output. Keep DEBUG logging disabled in production or restricted to specific components
   during active troubleshooting.

3. **Logs stored only on the application server.** If the server is compromised, the
   attacker deletes the local logs and the evidence is gone. Always forward logs to an
   independent aggregator in real time. The local log file on the application server should
   be treated as a buffer, not as the permanent record.

4. **No correlation IDs across services.** In a distributed system, a single user action may
   span multiple services. Without a request or correlation ID propagated through all service
   calls and included in every audit event, reconstructing an attack timeline requires manual
   timestamp correlation across dozens of log sources -- slow, error-prone, and often
   impossible when clocks are skewed. Propagate a correlation ID (via HTTP header, message
   metadata, or distributed tracing context) and include it in every audit event.

5. **Audit logging as an afterthought, added post-launch.** The most vulnerable period for
   an application is immediately after launch -- configuration is fresh, security hardening
   is incomplete, and the team is still learning the system's behavior. Adding audit logging
   weeks or months after launch means this critical period has no audit trail. Design and
   implement audit logging alongside the feature it monitors, shipping them together.

6. **Logging PII in violation of privacy regulations.** Audit logs that contain full names,
   email addresses, phone numbers, IP addresses (considered PII under GDPR), or health
   information create a secondary data protection liability. The audit log itself becomes a
   sensitive data store requiring access controls, encryption, and data subject access
   request handling. Log the minimum identifiers needed (user IDs, resource IDs) and join
   with the primary data store only when investigation requires it.

7. **Alert fatigue from poorly tuned thresholds.** Alerting on every failed login produces
   thousands of alerts per day, all ignored. Tune alert thresholds to reduce false positives:
   alert on 10+ failed logins from a single IP in 5 minutes, not on individual failures. Use
   progressive escalation: first alert goes to a Slack channel, repeated alerts page the
   on-call engineer. Review and adjust thresholds monthly based on alert-to-incident ratio.
