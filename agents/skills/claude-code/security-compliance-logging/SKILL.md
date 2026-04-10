# Compliance Logging

> Regulatory frameworks mandate specific logging requirements -- SOC2, GDPR, HIPAA, and
> PCI-DSS each define what must be logged, how long logs are retained, and what constitutes
> auditable evidence, and failing to meet these requirements carries fines, legal liability,
> and loss of certification

## When to Use

- Designing or auditing logging infrastructure for an organization subject to SOC2, GDPR,
  HIPAA, or PCI-DSS compliance requirements
- Preparing for a compliance audit and verifying that logging meets the framework's controls
- Determining log retention policies across different regulatory jurisdictions
- Deciding what to log and what must be excluded to avoid creating new compliance violations
- Building centralized log aggregation and ensuring tamper evidence for audit trails
- Resolving the tension between comprehensive logging and data minimization requirements

## Threat Context

Compliance logging failures create two categories of organizational risk: regulatory
penalties and undetectable breaches.

- **Equifax (2017)**: The breach exposed 147 million records. Post-breach investigation
  revealed that Equifax's logging was insufficient to determine the full scope of the
  compromise. Inadequate audit trails extended the investigation timeline by months and
  contributed to a $700 million settlement.
- **British Airways (2018)**: GDPR fine of 20 million GBP. The ICO found that BA's logging
  and monitoring systems failed to detect the Magecart skimming attack for over two months.
  Adequate logging of payment page modifications would have triggered alerts within hours.
- **Anthem (2015)**: The largest healthcare breach at the time (78.8 million records). HIPAA
  audit controls require logging of all access to electronic protected health information
  (ePHI). Anthem's insufficient access logging made it impossible to determine exactly which
  records the attacker accessed, complicating notification obligations.
- **GDPR data minimization paradox**: Article 5(1)(c) requires data minimization -- collect
  only what is necessary. But Article 30 requires records of processing activities, and
  Article 33 requires breach notification within 72 hours (which requires sufficient logging
  to detect breaches). Organizations must log enough to detect breaches and prove compliance
  while not logging so much that the logs themselves become a liability.

## Instructions

1. **Map your regulatory obligations to specific logging controls.** Each framework has
   explicit logging requirements:
   - **SOC2 (Trust Services Criteria)**: CC6.1 requires logical access controls with logging
     of access events. CC7.2 requires monitoring of system components for anomalies. CC7.3
     requires evaluation of security events. Logging must demonstrate that controls are
     operating effectively over the audit period (typically 12 months).
   - **GDPR**: Article 30 requires records of processing activities including purposes,
     categories of data subjects, and recipients. Article 5(1)(f) requires integrity and
     confidentiality of personal data, which demands access logging. Article 33 requires
     72-hour breach notification, which is impossible without detection logging.
   - **HIPAA (45 CFR 164.312(b))**: Audit controls must record and examine activity in
     information systems that contain or use ePHI. This includes login attempts, data access,
     data modification, and data export. The Security Rule requires both hardware and software
     audit mechanisms.
   - **PCI-DSS Requirement 10**: Track and monitor all access to network resources and
     cardholder data. Requirement 10.2 specifies exact events: all individual user access to
     cardholder data, all actions by anyone with root/admin privileges, access to audit trails,
     invalid access attempts, identification and authentication events, initialization of audit
     logs, creation/deletion of system-level objects.

2. **Implement correct retention periods.** Retention is not optional -- both too short and
   too long create violations:
   - **SOC2**: Minimum 1 year retention. The audit period is typically 12 months, and auditors
     require logs covering the entire period.
   - **PCI-DSS**: Minimum 1 year retention with at least 3 months immediately available for
     analysis. Older logs may be in archive storage but must be retrievable.
   - **HIPAA**: 6 years for security documentation and audit logs. This is the longest common
     retention requirement and often becomes the de facto minimum for healthcare organizations.
   - **GDPR**: No fixed retention period -- logs must be retained only as long as necessary
     for the stated purpose. A retention policy must document the purpose and the deletion
     schedule. Retaining logs indefinitely without justification violates data minimization.

3. **Define what to log and what to exclude.** The core auditable events are:
   - **Always log**: Authentication events (login success, login failure, logout, MFA
     challenge), authorization decisions (access granted, access denied, privilege escalation),
     data access (who accessed what record, when, from where), data modification (create,
     update, delete with before/after values where feasible), configuration changes (security
     settings, user provisioning, role assignments), administrative actions (system startup,
     shutdown, backup, restore).
   - **Never log**: Passwords or password hashes, full credit card numbers (log last 4 digits
     only per PCI-DSS), Social Security numbers, health records content (log access to the
     record, not the record itself), session tokens or API keys, biometric data.
   - **Mask in logs**: Email addresses (log `j***@example.com`), IP addresses in GDPR
     jurisdictions (IP is personal data -- log truncated or hashed IPs for analytics, full IPs
     only for security investigation with documented legal basis), names (log user IDs, not
     full names, unless the audit requires name resolution).

4. **Ensure tamper evidence for audit trails.** Auditors must trust that logs have not been
   modified after the fact:
   - Use append-only storage (WORM -- Write Once Read Many) for compliance-critical logs.
     AWS S3 Object Lock, Azure Immutable Blob Storage, and GCP Bucket Lock provide cloud-
     native WORM storage.
   - Implement log integrity verification using hash chains or Merkle trees. Each log entry
     includes a hash of the previous entry, creating a tamper-evident chain.
   - Centralize log collection immediately. Logs that remain on application servers can be
     modified by an attacker who compromises the server. Ship logs to a centralized system
     (SIEM, log aggregator) within seconds of generation.
   - Restrict access to the logging infrastructure. The application should be able to write
     logs but not read, modify, or delete them. Separate the logging system's access controls
     from the application's access controls.

5. **Maintain audit readiness at all times.** Compliance is not a point-in-time activity:
   - Run monthly log completeness checks: are all required event types being captured? Are
     there gaps in the timeline? Are all services and systems sending logs?
   - Conduct quarterly mock audits: pull a sample of logs and verify they contain the
     required fields, are properly retained, and can be searched and correlated.
   - Package evidence proactively: maintain a running evidence collection that maps each
     compliance control to the specific log queries, dashboards, or reports that demonstrate
     the control is operating. When the auditor arrives, the evidence is ready.
   - Document the logging architecture: auditors need to understand how logs flow from source
     to storage, what transformations occur, what the retention policy is, and who has access.

## Details

- **SOC2 Type II vs Type I and the logging implications**: Type I audits assess control
  design at a point in time -- the auditor verifies that logging controls exist. Type II
  audits assess control effectiveness over a period (typically 12 months) -- the auditor
  verifies that logging controls operated continuously and correctly throughout the period.
  A single month with missing logs or disabled monitoring can result in a qualified opinion
  or exception in the SOC2 Type II report. This means logging infrastructure must be treated
  with the same availability requirements as production systems.

- **GDPR's legitimate interest basis for security logging**: Under GDPR, processing personal
  data requires a legal basis. For security logging, the most common basis is Article 6(1)(f)
  -- legitimate interest. The organization has a legitimate interest in detecting and
  preventing security incidents. A Legitimate Interest Assessment (LIA) documents that the
  logging is necessary, proportionate, and that the individual's rights do not override the
  interest. This assessment should be documented and reviewed annually. Without it, logging
  personal data (even IP addresses) lacks a legal basis.

- **PCI-DSS Requirement 10 in depth**: Requirement 10.2 mandates logging specific events.
  Requirement 10.3 mandates specific fields in each log entry: user identification, type of
  event, date and time, success or failure, origination of event, identity or name of affected
  data/system/resource. Requirement 10.4 mandates time synchronization using NTP -- all
  systems must agree on the time so that log correlation across systems is accurate.
  Requirement 10.5 mandates securing audit trails so they cannot be altered. Requirement 10.7
  mandates retaining audit trail history for at least 12 months.

- **Log format standardization across services**: Use a consistent structured format (JSON
  with a defined schema) across all services. Every log entry should include: timestamp
  (ISO 8601, UTC), event type (from a controlled vocabulary), actor (user ID, service
  account, or system), action (verb from a controlled vocabulary), resource (what was acted
  upon), outcome (success/failure), source IP, request ID (for correlation), and session ID.
  Inconsistent formats across services make audit evidence unreliable because the auditor
  cannot compare events across systems.

## Anti-Patterns

1. **Logging PII or PHI without masking.** An organization implements comprehensive logging
   to demonstrate HIPAA compliance but includes patient names and diagnosis codes in access
   logs. The logs themselves now contain ePHI, requiring the same protections as the clinical
   database. The logging system has created a second copy of sensitive data, expanding the
   attack surface and the compliance scope. Log the access event (who, when, which record ID)
   but not the record content.

2. **Retaining logs indefinitely without a documented policy.** An organization stores all
   logs forever because "storage is cheap" and "we might need them." Under GDPR, this violates
   Article 5(1)(e) storage limitation -- personal data must not be kept longer than necessary.
   The organization now has years of IP addresses, user activity patterns, and behavioral data
   with no legal basis for retention. Define retention periods per regulatory requirement,
   implement automated deletion, and document the policy.

3. **No centralized log collection.** Logs remain on individual application servers, database
   servers, and network devices. When an auditor requests evidence, the team must manually
   collect logs from dozens of systems, hoping nothing was lost to log rotation or disk
   failures. When an attacker compromises a server, they delete the local logs to cover their
   tracks. Ship all logs to a centralized, access-restricted system within seconds.

4. **Different logging standards across services.** One service logs authentication events
   with user ID and timestamp. Another logs with username and local time. A third does not
   log authentication events at all. The auditor cannot construct a consistent picture of
   access patterns across the organization. Define a logging standard with required fields
   and event types, enforce it through shared libraries or middleware, and validate compliance
   in CI.

5. **Treating compliance logging as a separate system from security logging.** Building a
   dedicated "compliance log" pipeline that captures a subset of events for auditors, while
   the security team uses a different logging pipeline for detection and response. The
   compliance logs miss events the security team catches, and the security logs miss events
   the auditors need. Use a single logging infrastructure that serves both purposes. Apply
   different retention policies and access controls to the same data rather than maintaining
   parallel systems.
