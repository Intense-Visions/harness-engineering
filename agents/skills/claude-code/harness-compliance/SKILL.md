# Harness Compliance

> SOC2, HIPAA, GDPR compliance checks, audit trails, and regulatory checklists. Scans codebases for compliance-relevant patterns, classifies data by sensitivity, audits implementation against framework-specific controls, and generates gap analysis reports with remediation plans.

## When to Use

- At milestone boundaries to audit compliance posture before releases to regulated markets
- On PRs that modify data handling, storage, logging, or user-facing privacy features
- When preparing for external audits (SOC2 Type II, HIPAA assessment, GDPR DPA review)
- NOT for runtime security scanning or vulnerability detection (use harness-security-scan)
- NOT for authentication or authorization implementation (use harness-auth)
- NOT for infrastructure security hardening (use harness-security-review)

## Process

### Phase 1: SCAN -- Detect Applicable Frameworks and Data Patterns

1. **Identify applicable compliance frameworks.** Scan for indicators:
   - SOC2: presence of `docs/compliance/soc2/`, audit logging implementation, access control patterns
   - HIPAA: healthcare-related data models (patient, diagnosis, prescription), PHI field markers
   - GDPR: EU user data handling, consent collection, cookie banners, privacy policy references
   - PCI-DSS: payment processing, credit card fields, tokenization, PCI scope markers
   - Detect from existing compliance documentation, data models, and configuration files

2. **Inventory data stores.** Map all locations where user data is persisted:
   - Databases: table schemas, column names, migration files
   - Object storage: S3 buckets, GCS buckets, Azure Blob containers
   - Caches: Redis keys, Memcached namespaces
   - Log files: structured logging output, log aggregation configuration
   - Third-party services: analytics (Segment, Mixpanel), CRM (Salesforce, HubSpot), email (SendGrid, Mailchimp)

3. **Trace data flows.** Map how user data moves through the system:
   - Ingestion: API endpoints that accept user input, form submissions, file uploads
   - Processing: services that transform, aggregate, or enrich user data
   - Storage: where processed data is persisted (primary database, cache, search index)
   - Egress: data shared with third parties, exported, or displayed to other users
   - Deletion: how data is removed when retention expires or deletion is requested

4. **Check for existing compliance artifacts.** Look for:
   - Privacy policy: `PRIVACY.md`, `privacy-policy.md`, or served via web route
   - Security policy: `SECURITY.md`, security disclosure process
   - Data processing agreements: `docs/compliance/dpa/`
   - Audit trail implementation: `src/**/audit/**`, event sourcing patterns
   - Consent management: cookie consent banners, preference centers

5. **Detect sensitive data patterns.** Grep for fields and patterns that indicate regulated data:
   - PII: email, phone, address, SSN, date of birth, government ID
   - PHI: diagnosis, treatment, prescription, medical record number, insurance ID
   - Financial: credit card number, bank account, routing number, transaction amount
   - Authentication: password (even hashed), API key, secret, token

---

### Phase 2: CLASSIFY -- Data Sensitivity and Regulatory Scope

1. **Classify data fields by sensitivity.** Apply a tiered classification:
   - **Critical:** Data whose exposure triggers mandatory breach notification (SSN, credit card, PHI)
   - **Sensitive:** PII that identifies individuals (email, phone, address, name + DOB)
   - **Internal:** Business data not publicly available (order history, usage metrics, preferences)
   - **Public:** Data intentionally shared (username, public profile, published content)

2. **Map regulatory scope per data class.** Determine which frameworks apply to each data class:
   - Critical financial data -> PCI-DSS scope
   - PHI data -> HIPAA scope
   - EU resident PII -> GDPR scope
   - All customer data in a SOC2-audited system -> SOC2 scope

3. **Identify cross-border data flows.** For GDPR compliance:
   - Where are data stores physically located? (AWS region, GCP region, Azure region)
   - Does data transfer to non-EU countries? (US servers, CDN nodes, third-party processors)
   - Are Standard Contractual Clauses (SCCs) or adequacy decisions in place?
   - Is data residency configurable per tenant?

4. **Document data retention policies.** For each data class:
   - What is the defined retention period?
   - Is automatic deletion implemented (TTL, scheduled job, lifecycle policy)?
   - What happens to data in backups after retention expires?
   - Are retention policies documented and accessible?

5. **Produce the data classification matrix.** Output a structured inventory:
   - Data field, classification tier, applicable frameworks, storage location, retention policy, encryption status

---

### Phase 3: AUDIT -- Check Against Framework Controls

1. **SOC2 Trust Services Criteria audit.** Check implementation against key controls:
   - **CC6.1 (Logical Access):** Are all endpoints authenticated? Is RBAC/ABAC enforced?
   - **CC6.2 (Credential Management):** Are passwords hashed with strong algorithms? Is MFA available?
   - **CC6.3 (Encryption):** Is data encrypted at rest (database, file storage) and in transit (TLS)?
   - **CC7.2 (System Monitoring):** Are security events logged? Are alerts configured for anomalies?
   - **CC8.1 (Change Management):** Is there a code review process? Are deployments auditable?

2. **HIPAA Security Rule audit.** If PHI is present:
   - **164.312(a)(1) Access Control:** Unique user identification, emergency access, automatic logoff, encryption
   - **164.312(b) Audit Controls:** Record and examine activity in information systems containing PHI
   - **164.312(c)(1) Integrity:** Protect electronic PHI from improper alteration or destruction
   - **164.312(d) Authentication:** Verify identity of person or entity seeking access to PHI
   - **164.312(e)(1) Transmission Security:** Encrypt PHI during electronic transmission

3. **GDPR compliance audit.** If EU data is processed:
   - **Article 6 (Lawful Basis):** Is consent collected? Is legitimate interest documented?
   - **Article 13/14 (Transparency):** Is a privacy notice provided at data collection points?
   - **Article 15 (Right of Access):** Can users export their data? Is there a data export endpoint?
   - **Article 17 (Right to Erasure):** Can users request deletion? Is it implemented across all stores?
   - **Article 25 (Data Protection by Design):** Are privacy defaults enforced (minimal data collection)?
   - **Article 30 (Records of Processing):** Is there a processing activities register?
   - **Article 32 (Security of Processing):** Encryption, pseudonymization, resilience, regular testing
   - **Article 33 (Breach Notification):** Is there a 72-hour breach notification process?

4. **PCI-DSS audit.** If payment data is present:
   - **Requirement 3:** Is cardholder data encrypted at rest? Is PAN masked in displays?
   - **Requirement 4:** Is cardholder data encrypted in transit?
   - **Requirement 6:** Are secure development practices followed? Is input validated?
   - **Requirement 8:** Is access to cardholder data authenticated and authorized?
   - **Requirement 10:** Are all access events to cardholder data logged?

5. **Audit trail verification.** For all applicable frameworks:
   - Are audit events immutable (append-only log, write-once storage)?
   - Do audit records include who, what, when, where, and outcome?
   - Is the audit log protected from tampering (separate access controls, checksums)?
   - Is the audit log retained for the required period (SOC2: 1 year, HIPAA: 6 years, GDPR: varies)?

---

### Phase 3.5: INTERNAL COMPLIANCE -- Project Conventions

1. **Verify branch naming convention.** Check the current branch name against project rules:
   - Allowed prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `perf/`
   - Format: `prefix/kebab-case-description` or `prefix/PROJ-123-description`
   - Command: `harness verify`

---

### Phase 4: REPORT -- Generate Gap Analysis and Remediation Plan

1. **Score compliance posture per framework.** For each applicable framework:
   - Total controls assessed
   - Controls fully met, partially met, and not met
   - Overall compliance percentage
   - Risk rating: High (critical controls missing), Medium (non-critical gaps), Low (minor gaps)

2. **Produce the gap analysis.** For each control not fully met:
   - Control identifier and description
   - Current implementation status (not started, partial, misconfigured)
   - Specific code locations or configurations that need change
   - Remediation steps with effort estimate (hours/days)
   - Priority based on risk and audit timeline

3. **Generate audit-ready checklists.** Produce framework-specific checklists:
   - SOC2: Trust Services Criteria checklist with evidence references
   - HIPAA: Security Rule safeguard checklist with implementation status
   - GDPR: Article-by-article compliance checklist with data flow references
   - PCI-DSS: Requirement checklist with scope boundaries

4. **Create remediation plan.** Organize gaps into actionable work:
   - **Phase 1 (Critical, 0-2 weeks):** Fix blocking gaps that would fail an audit
   - **Phase 2 (Important, 2-6 weeks):** Address significant gaps that reduce compliance posture
   - **Phase 3 (Improvement, 6-12 weeks):** Enhance documentation, monitoring, and process maturity
   - Each item includes: description, affected control, owner placeholder, effort estimate

5. **Output the compliance report.** Generate `docs/compliance/audit-report-YYYY-MM-DD.md`:

   ```
   Compliance Audit Report — YYYY-MM-DD

   Frameworks Assessed: SOC2, GDPR
   Data Classifications: 12 critical, 28 sensitive, 45 internal, 15 public

   SOC2 Status: 78% (18/23 controls met, 3 partial, 2 not met)
     NOT MET:
       CC7.2 — No security event alerting configured
       CC8.1 — No deployment audit trail
     PARTIAL:
       CC6.1 — RBAC exists but 4 endpoints lack authorization checks
       CC6.3 — TLS in transit, but database encryption at rest not configured
       CC6.2 — Passwords hashed, but no MFA available

   GDPR Status: 65% (11/17 controls met, 4 partial, 2 not met)
     NOT MET:
       Article 17 — No data deletion endpoint implemented
       Article 30 — No processing activities register
     PARTIAL:
       Article 15 — Data export exists but incomplete (missing analytics data)
       ...

   Remediation Plan: 7 items (2 critical, 3 important, 2 improvement)
   Estimated total effort: 45 engineering-hours
   ```

---

## Harness Integration

- **`harness skill run harness-compliance`** -- Primary CLI entry point. Runs all four phases.
- **`harness validate`** -- Run after generating compliance artifacts to verify project structure.
- **`harness check-deps`** -- Verify that compliance-related dependencies (audit logging libraries, encryption modules) are declared.
- **`emit_interaction`** -- Used at framework selection (checkpoint:decision) when multiple frameworks apply and the team wants to prioritize, and at remediation plan review (checkpoint:human-verify).
- **`Glob`** -- Discover compliance documentation, audit trail implementations, privacy policies, and data models.
- **`Grep`** -- Search for PII field patterns, encryption configurations, consent collection, logging patterns, and sensitive data handling.
- **`Write`** -- Generate compliance reports, audit checklists, and remediation plans.
- **`Edit`** -- Update existing compliance documentation with current audit status.

## Success Criteria

- All applicable compliance frameworks are identified with justification for inclusion
- Data classification matrix covers all persisted user data fields with sensitivity tier and storage location
- Audit checks reference specific framework control identifiers (SOC2 CC6.1, GDPR Article 17, etc.)
- Gap analysis includes specific file locations and code references, not just abstract control descriptions
- Remediation plan items have effort estimates and are prioritized by risk and audit timeline
- Audit-ready checklists can be handed directly to an external auditor as evidence documentation

## Examples

### Example: SaaS Application with SOC2 and GDPR Requirements

```
Phase 1: SCAN
  Frameworks detected:
    - SOC2: docs/compliance/soc2/ directory exists, audit logging in src/audit/
    - GDPR: EU customers present (detected from i18n locales and privacy policy)
    - PCI-DSS: Not applicable (payments via Stripe, card data never touches servers)
  Data stores: PostgreSQL (primary), Redis (cache/sessions), S3 (file uploads)
  Third-party processors: Stripe, SendGrid, Segment, Datadog

Phase 2: CLASSIFY
  Critical: None (no SSN, card data handled by Stripe)
  Sensitive: email, phone, address (users table), IP address (access_logs)
  Internal: order_history, preferences, usage_metrics
  Public: username, display_name, avatar_url
  Cross-border: Primary DB in us-east-1, CDN globally, Segment data to US
  GDPR gap: No SCCs documented for US-based sub-processors

Phase 3: AUDIT
  SOC2: 78% compliant (18/23)
    CC6.3 — PostgreSQL not using column-level encryption for sensitive fields
    CC7.2 — Datadog alerts exist but no security-specific monitors
  GDPR: 65% compliant (11/17)
    Article 17 — DELETE /api/users/:id exists but does not cascade to S3 files or Segment
    Article 30 — No Records of Processing Activities document

Phase 4: REPORT
  Generated: docs/compliance/audit-report-2026-03-27.md
  Remediation plan:
    Critical (week 1-2):
      1. Implement cascading deletion across PostgreSQL, S3, Segment, SendGrid
      2. Create Records of Processing Activities document
    Important (week 3-6):
      3. Add column-level encryption for email, phone, address fields
      4. Create security-specific Datadog monitors for auth failures
      5. Document SCCs for all US-based sub-processors
    Improvement (week 7-12):
      6. Implement data export endpoint including Segment analytics data
      7. Add automated retention enforcement with TTL-based cleanup jobs
```

### Example: Healthcare Platform with HIPAA Requirements

```
Phase 1: SCAN
  Frameworks detected:
    - HIPAA: patient, diagnosis, prescription models in src/models/
    - SOC2: Required by enterprise customers, docs/compliance/soc2/ present
  Data stores: PostgreSQL (primary), Redis (session cache), AWS S3 (medical records)
  Third-party processors: Twilio (patient notifications), AWS (infrastructure)
  BAA status: AWS BAA signed, Twilio BAA signed

Phase 2: CLASSIFY
  Critical (PHI):
    - patient_records: name, DOB, SSN, diagnosis_code, treatment_plan
    - prescriptions: medication, dosage, prescribing_physician
    - medical_images: stored in S3 bucket 'patient-records-prod'
  Sensitive: provider email, staff credentials, appointment schedules
  PHI field count: 23 fields across 8 tables

Phase 3: AUDIT
  HIPAA Security Rule: 72% compliant
    164.312(a)(1) — Access control exists but no automatic session logoff
    164.312(b) — Audit log captures reads but not all PHI access events
    164.312(c)(1) — No integrity checksums on medical records in S3
    164.312(e)(1) — TLS 1.2 in transit, AES-256 at rest in PostgreSQL and S3
  SOC2: 81% compliant
    All findings overlap with HIPAA gaps

Phase 4: REPORT
  Generated: docs/compliance/hipaa-audit-2026-03-27.md
  Remediation plan:
    Critical (week 1-2):
      1. Add automatic session timeout (15 min idle) for clinical users
      2. Extend audit logging to capture all PHI read events with user context
      3. Add SHA-256 integrity checksums to S3 medical record objects
    Important (week 3-6):
      4. Implement minimum necessary access — restrict PHI queries to treating providers
      5. Add PHI access review report for compliance officer (monthly)
    Improvement (week 7-12):
      6. Implement emergency access ("break the glass") with post-access audit
      7. Add automated HIPAA compliance regression tests to CI pipeline
```

## Rationalizations to Reject

| Rationalization                                                                 | Reality                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "We're not in the EU so GDPR doesn't apply to us"                               | GDPR applies to any organization that processes data of EU residents, regardless of where the organization is based. If a single EU user can sign up, GDPR scope must be assessed.                                                            |
| "Our lawyers will handle the compliance questions — just document what we have" | Legal review and technical implementation are distinct. Lawyers cannot attest that Article 17 deletion cascades to S3 and Segment. The technical implementation must be audited separately.                                                   |
| "We already did a SOC2 audit last year — this codebase is the same"             | SOC2 Type II assesses controls over time. Adding a new data store, third-party processor, or API endpoint can invalidate previous control attestations. Audits are point-in-time snapshots, not permanent certificates.                       |
| "The audit isn't for three months — we can fix the gaps before then"            | Gaps found now require implementation, testing, and evidence collection time. Auditors expect evidence of sustained control operation, not freshly deployed fixes. A gap fixed the week before an audit is still a finding.                   |
| "That field is technically a username, not PII"                                 | Data classification cannot be done by naming convention. A username combined with any other identifying field (email, IP, phone) is PII under GDPR. Classification must be based on the realistic re-identification risk, not the field name. |

## Gates

- **No compliance report without data classification.** A compliance audit that does not inventory and classify data fields is incomplete. The classification matrix must be produced before controls can be meaningfully assessed. Without knowing what data exists and where, control checks are theoretical.
- **No critical control gaps left without remediation plan.** Every control marked "not met" must have a corresponding remediation item with effort estimate and priority. Identifying gaps without a path to closure is shelf-ware.
- **No PII/PHI field handling changes without re-audit.** When a PR adds or modifies fields classified as sensitive or critical, the compliance audit for affected frameworks must be re-run. Data handling changes can invalidate previous compliance assessments.
- **No third-party data sharing without documented basis.** Every third-party that receives user data must have a documented lawful basis (GDPR), BAA (HIPAA), or be within scope boundaries (SOC2/PCI-DSS). Undocumented data sharing is a blocking compliance gap.

## Escalation

- **When compliance requirements conflict with business timelines:** Report: "The GDPR Article 17 implementation requires [N] engineering-hours and touches [M] services. If the audit deadline is [date], recommend prioritizing the critical controls and documenting a remediation timeline for the remaining gaps. Partial compliance with a credible plan is better than no plan."
- **When legal interpretation is needed:** Report: "The application of [specific regulation article] to [specific data handling pattern] requires legal interpretation. This skill identifies technical implementation gaps but cannot determine legal applicability. Recommend consulting with legal counsel on [specific question]."
- **When third-party processors lack required agreements:** Report: "[Processor] handles [data type] but no [BAA/DPA/SCC] is on file. This is a blocking compliance gap. Options: (1) execute the required agreement with the processor, (2) migrate to an alternative processor with agreements in place, (3) stop sending regulated data to this processor."
- **When audit trail implementation requires significant architecture changes:** Report: "The current logging infrastructure does not support immutable, tamper-evident audit trails required by [framework]. Options: (1) add append-only audit table with separate write credentials, (2) use a dedicated audit service (e.g., AWS CloudTrail, custom event store), (3) adopt event sourcing for regulated data flows. Effort estimate: [N] weeks."
