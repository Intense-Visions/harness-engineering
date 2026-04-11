# Log Correlation and SIEM

> Correlate events across multiple log sources to detect attacks that are invisible in any
> single log stream -- because attackers do not confine their activities to one system

## When to Use

- Designing or deploying a SIEM (Security Information and Event Management) system
- Building correlation rules to detect multi-stage attacks across distributed systems
- Suffering from alert fatigue and need to tune detection rules and triage workflows
- Integrating application logs, authentication logs, network logs, and cloud audit logs into a
  unified detection platform
- Meeting compliance requirements for centralized security monitoring (SOC2, PCI-DSS, HIPAA)
- Establishing a detection engineering practice aligned with MITRE ATT&CK

## Threat Context

Modern attacks span multiple systems: an attacker phishes credentials (email logs), logs in from
an anomalous location (authentication logs), escalates privileges (directory service logs),
accesses sensitive data (application logs), and exfiltrates it (network flow logs). Each
individual event may appear benign in isolation. A login from a new country is unusual but not
necessarily malicious. A large data download might be a legitimate export. An admin privilege
grant could be a routine onboarding. Only by correlating events across sources does the attack
pattern emerge: new-location login -> privilege escalation -> bulk data access -> outbound data
transfer = likely account compromise and data exfiltration.

The 2020 SolarWinds SUNBURST attack evaded detection for 9+ months because the attackers
specifically designed their activity to blend into normal operations. They used legitimate
credentials, operated during business hours, and limited the volume of their data exfiltration.
Detection required correlating anomalous DNS queries to unusual API access patterns to
unexpected cloud configuration changes -- a correlation that most organizations' monitoring
infrastructure was not configured to perform.

The IBM/Ponemon 2023 Cost of a Data Breach Report found that organizations with security AI and
automation (which depends on correlated, structured log data) identified and contained breaches
108 days faster than those without, saving an average of $1.76 million per breach. The detection
gap is not a data problem -- organizations collect massive volumes of logs -- it is a correlation
and analysis problem.

## Instructions

1. **Identify and onboard critical log sources.** Prioritize log sources by detection value:
   authentication systems (Active Directory, Okta, Auth0 -- login success, failure, MFA events),
   cloud audit logs (AWS CloudTrail, GCP Cloud Audit Logs, Azure Activity Log -- API calls,
   configuration changes, resource access), application audit logs (business logic events,
   data access, administrative actions), network flow logs (VPC Flow Logs, firewall logs --
   lateral movement, data exfiltration indicators), DNS logs (query logs reveal C2
   communication, data exfiltration via DNS tunneling, domain generation algorithm activity),
   and endpoint detection (EDR telemetry -- process execution, file access, registry changes).
   Start with authentication and cloud audit logs -- they provide the highest detection value
   per integration effort.

2. **Normalize log formats into a common schema.** Logs from different sources use different
   field names, timestamp formats, and structures. Normalize all ingested logs to a common
   schema so that correlation rules can reference consistent field names. Common schemas:
   Elastic Common Schema (ECS), Open Cybersecurity Schema Framework (OCSF), MITRE CAR
   (Cyber Analytics Repository). At minimum, normalize: timestamp (UTC ISO 8601), source IP,
   destination IP, user identity, action performed, outcome (success/failure), and resource
   accessed. Without normalization, every correlation rule must account for format differences
   across sources.

3. **Build correlation rules for known attack patterns.** Start with high-confidence, low-volume
   detections: account compromise indicators (failed login followed by successful login from a
   different IP within 10 minutes), impossible travel (successful logins from geographically
   distant locations within an impossible time window), brute force (more than N failed logins
   against a single account within M minutes), privilege escalation (admin role granted followed
   by unusual resource access), and lateral movement (authentication from an internal IP that
   has never accessed that service before, especially after an initial compromise indicator).
   Each rule should have a documented rationale, expected false-positive rate, and a runbook.

4. **Align detections with MITRE ATT&CK.** Map each detection rule to a MITRE ATT&CK technique
   (e.g., brute force detection maps to T1110, impossible travel maps to T1078.004). This
   provides coverage visibility: which ATT&CK techniques do your detections cover, and which
   are gaps? Use the ATT&CK Navigator to visualize coverage. Prioritize detections for
   techniques used by threat actors relevant to your industry (use MITRE ATT&CK Groups and
   Software databases). Detection engineering is not about covering every technique -- it is
   about covering the techniques most likely to be used against your specific organization.

5. **Use Sigma rules for portable detection logic.** Sigma is an open standard for writing
   detection rules in a SIEM-agnostic YAML format. A single Sigma rule can be converted to
   Splunk SPL, Elastic KQL, Microsoft Sentinel KQL, CrowdStrike, and other SIEM query
   languages using the `sigma-cli` converter. Benefits: share detection rules across
   organizations, leverage the community Sigma rule repository (thousands of rules covering
   common attack techniques), write rules once and deploy to any SIEM. Store custom Sigma rules
   in version control and treat them as code with review, testing, and deployment processes.

6. **Manage alert fatigue systematically.** Alert fatigue is the primary failure mode of SIEM
   deployments. When analysts receive more than 50-100 alerts per day, they begin ignoring
   alerts, missing real incidents among the noise. Management strategies: severity
   classification (critical alerts page on-call, high alerts go to the queue, medium alerts
   go to a daily review batch, low alerts are logged but not alerted), progressive escalation
   (first occurrence goes to Slack, repeated pattern pages), tuning cadence (review the
   top 10 noisiest rules monthly, disable or refine rules with false-positive rates above 90%),
   and alert-to-incident ratio tracking (target at least 1 true positive per 10 alerts;
   below 1:100 means the rule is noise).

7. **Attach runbooks to every alert.** Every alert that fires should include a link to a runbook
   that tells the analyst: what this alert means, what to investigate first (specific queries,
   dashboards, or data to check), how to determine if it is a true positive, what the
   escalation path is if confirmed, and what the containment actions are. Alerts without
   runbooks force analysts to investigate from scratch every time, increasing response time
   and analyst burnout. Runbooks should be living documents updated after every investigation.

## Details

- **SIEM architecture components**: Collection layer (Fluentd, Filebeat, Logstash, cloud-native
  log forwarders -- collect logs from sources and forward to the SIEM), normalization layer
  (parse raw logs into structured fields using the common schema), storage layer (hot storage
  for recent logs with fast query performance, warm storage for older logs with slower queries,
  cold storage for archive and compliance), correlation engine (evaluates rules against incoming
  events in real time or near-real-time), alerting layer (routes triggered rules to notification
  channels with severity-based routing), and investigation layer (search interface, dashboards,
  and forensic tools for analyst investigation).

- **SIEM tool landscape**: Splunk (market leader, powerful SPL query language, expensive at
  scale), Elastic SIEM (open-source core, ECS normalization, good for organizations with
  existing Elasticsearch investment), Microsoft Sentinel (cloud-native, strong Azure and M365
  integration, KQL query language), CrowdStrike Falcon LogScale (high-ingestion performance,
  integrated with CrowdStrike EDR), Wazuh (open-source, combined SIEM and endpoint detection),
  Security Onion (open-source, combines multiple tools for network security monitoring). Choice
  depends on: budget, existing infrastructure, log volume, team expertise, and integration
  requirements.

- **Detection engineering as a practice**: Detection engineering treats detection rules as
  software: version-controlled, tested, reviewed, and deployed through a CI/CD pipeline. Each
  detection has: a hypothesis (what attack behavior it detects), a rule (the query logic),
  test data (synthetic events that should and should not trigger the rule), a tuning history
  (false-positive analysis and adjustments), and performance metrics (true positive rate,
  mean time to detect, analyst feedback). The Palantir Detection-as-Code framework and
  Florian Roth's Sigma project are leading examples of this practice.

- **Correlation rule complexity levels**: Level 1 -- single-source, single-event (failed login
  count > threshold). Level 2 -- single-source, multi-event (failed logins followed by
  successful login). Level 3 -- multi-source, multi-event (authentication anomaly + privilege
  change + data access). Level 4 -- behavioral baseline deviation (user accessing resources
  they have never accessed before, at unusual times, in unusual volumes). Start with Level 1
  and 2 rules, which are easier to implement and tune. Level 3 and 4 require more mature log
  ingestion and normalization.

## Anti-Patterns

1. **Collecting logs without correlation rules -- a data lake, not a SIEM.** Ingesting terabytes
   of logs into a central store without writing detection rules means you have an expensive
   log archive, not a security monitoring capability. Logs provide detection value only when
   correlation rules actively analyze them. Start with 10-20 high-confidence detection rules
   rather than attempting to ingest every possible log source first.

2. **Alert storms from untuned rules.** Deploying default detection rules without tuning for
   the environment generates hundreds or thousands of alerts daily. Analysts quickly learn to
   ignore the SIEM, and real incidents are buried in noise. Research consistently shows that
   more than 100 alerts per analyst per day leads to alert fatigue and missed detections. Start
   with a small set of tuned, high-confidence rules and expand gradually.

3. **SIEM as a compliance checkbox without active monitoring.** Deploying a SIEM to satisfy
   SOC2 or PCI-DSS audit requirements but assigning no one to monitor it. Alerts fire into an
   unmonitored inbox. The SIEM provides forensic value (logs are available for post-incident
   investigation) but zero detection value. A SIEM without dedicated analysts or an MSSP
   (Managed Security Service Provider) monitoring it is a waste of the investment.

4. **No runbooks attached to alerts.** Alerts that provide a title and a severity but no
   investigation guidance. The analyst receives "Impossible Travel Detected -- High" and must
   figure out from scratch what to check, where to look, and how to determine if it is real.
   Every alert must link to a runbook with specific investigation steps, escalation criteria,
   and containment actions.

5. **Alerting on everything instead of known attack patterns.** Attempting to detect every
   possible anomaly rather than focusing on known attack patterns mapped to MITRE ATT&CK.
   Generic anomaly detection produces enormous volumes of alerts with low signal-to-noise ratio.
   Start with detections for specific, known attack techniques relevant to your threat model,
   and expand coverage based on threat intelligence and incident learnings.

6. **No feedback loop from investigations to rule tuning.** Analysts investigate alerts, resolve
   them, and move on without feeding their findings back to the detection engineering team.
   Each investigation should produce one of: a confirmed true positive (document the attack
   pattern for training), a false positive (tune the rule to exclude this pattern), or a
   detection gap (the alert fired for the wrong reason, but the investigation revealed a real
   issue that needs a new detection rule). Without this feedback loop, detection quality
   stagnates.
