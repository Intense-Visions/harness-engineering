# Post-Incident Review

> Organizations that conduct blameless post-incident reviews after every significant security
> incident reduce their recurrence rate by identifying systemic weaknesses; organizations that
> skip the review are condemned to repeat the same failures with different symptoms

## When to Use

- A security incident has been contained and remediated, and it is time to analyze what
  happened and why
- Establishing a post-incident review process for an organization that does not have one
- Reviewing the effectiveness of existing incident response processes after an exercise or
  real incident
- Tracking remediation actions from previous incidents to ensure they are completed
- Building organizational security culture through structured learning from failures
- Analyzing patterns across multiple incidents to identify systemic weaknesses

## Threat Context

Post-incident reviews exist because security incidents reveal information about defenses that
cannot be obtained any other way. The incident is evidence that at least one control failed,
one assumption was wrong, or one process had a gap. Without a structured review, that
evidence is lost:

- **Uber (2016 breach, disclosed 2017)**: An attacker accessed a private GitHub repository
  containing AWS credentials, used them to access an S3 bucket with 57 million user records.
  Uber paid the attacker $100,000 through a bug bounty program to destroy the data and keep
  quiet -- instead of conducting a proper review and disclosure. The cover-up was discovered
  in 2017, resulting in the CISO's criminal prosecution and a $148 million settlement. A
  genuine post-incident review would have identified the root causes (credentials in source
  code, overly permissive S3 access, no credential rotation) and the cover-up decision would
  have been avoided through proper process.
- **Capital One (2019)**: After the breach (SSRF to EC2 metadata to IAM credentials to S3),
  the post-incident review identified that the specific misconfiguration had been flagged by
  internal security tools but was deprioritized. The review led to changes in how security
  findings are triaged and escalated -- a systemic improvement that addressed not just this
  vulnerability but an entire class of ignored findings.
- **GitLab database incident (2017)**: An engineer accidentally deleted a production database
  during maintenance. The post-incident review was conducted publicly and documented in
  exhaustive detail, revealing that 5 out of 5 backup mechanisms had some form of failure.
  The public, blameless review became a model for the industry and led to comprehensive
  improvements in GitLab's backup and recovery processes.
- **Cloudflare (2017, Cloudbleed)**: A buffer overrun in Cloudflare's HTML parser caused
  customer data from one site to leak into responses served to other sites. Cloudflare
  published a detailed, transparent post-incident review that included the timeline, root
  cause analysis, and remediation steps. The transparency maintained customer trust despite
  the severity of the bug.

## Instructions

1. **Establish blameless review as a non-negotiable principle.** The purpose of the review is
   to improve systems and processes, not to punish individuals:
   - **Why blameless**: People make mistakes in every system. If the review assigns blame,
     people learn to hide mistakes, cover up incidents, and avoid reporting near-misses. The
     organization loses its most valuable source of security intelligence. If the review
     focuses on systems, people report freely, share what they observed, and contribute to
     solutions.
   - **Blameless does not mean accountable-less**: The review identifies systemic failures
     (missing controls, inadequate monitoring, unclear procedures) and assigns remediation
     actions to owners. The person who made the error is often the best person to help design
     the systemic fix because they understand the context that led to the error.
   - **Enforce blamelessness actively**: If someone in the review starts assigning personal
     blame ("Alice should have known better"), the facilitator redirects: "What about the
     system made it possible for anyone in Alice's position to make that mistake? What control
     or process could have prevented or caught this?"

2. **Conduct the review within 5 business days of incident resolution.** Memory fades rapidly.
   The review should happen while details are fresh but after the immediate crisis has passed:
   - **Participants**: Everyone directly involved in the incident response (responders,
     engineers, on-call staff), the incident commander, relevant engineering leads, a
     facilitator (ideally someone not involved in the response, to provide objectivity), and
     optionally a representative from legal/compliance.
   - **Duration**: 60-90 minutes for most incidents. Major incidents (P1) may require 2-3
     hours or multiple sessions.
   - **Pre-work**: Distribute the incident timeline (from the forensics phase) to all
     participants before the meeting. Ask each participant to annotate with their observations,
     decisions, and what information they had (or lacked) at each decision point.

3. **Follow a structured review format.** The review must produce actionable output, not just
   discussion:
   - **Timeline walkthrough (20 minutes)**: Walk through the incident chronologically. At
     each phase, ask: What happened? What did we know at the time? What did we do? What
     information were we missing?
   - **Detection analysis (10 minutes)**: How was the incident detected? How long was the
     dwell time (time between initial compromise and detection)? What detection mechanisms
     existed and why did they not trigger sooner? What would have detected this faster?
   - **Response analysis (10 minutes)**: How effective was the containment? Was the correct
     containment strategy chosen? Were the right people notified at the right time? What
     slowed down the response?
   - **Contributing factor analysis (20 minutes)**: Use the Five Whys technique to identify
     root causes. Do not stop at the proximate cause ("the server was misconfigured"). Ask
     why five times: Why was it misconfigured? Because the configuration was manual. Why was
     it manual? Because there is no infrastructure-as-code for that component. Why not?
     Because it was deployed before the IaC standard was established. Why was it not migrated?
     Because there is no inventory of pre-standard deployments. Root cause: no migration
     tracking for legacy infrastructure.
   - **Remediation planning (20 minutes)**: For each contributing factor, define a specific
     remediation action with: owner (named individual, not a team), deadline, severity
     (critical, high, medium, low), and verification criteria (how do we know it is done and
     working?).

4. **Track remediation actions to completion.** The review document is worthless if remediation
   actions are not completed:
   - Assign each action a unique identifier and track it in the organization's issue tracker
     (JIRA, Linear, GitHub Issues) alongside engineering work.
   - Set review cadence: check status of open remediation actions weekly for critical/high
     items, biweekly for medium, monthly for low.
   - Escalate overdue items. If a critical remediation action misses its deadline, escalate
     to the responsible director or VP. Remediation items that languish indefinitely signal
     that the organization does not take the review process seriously.
   - Close actions only when the verification criteria are met. "We deployed the fix" is not
     sufficient. "We deployed the fix, verified it with a test that reproduces the original
     vulnerability, and added a regression test to CI" is sufficient.

5. **Share findings and build organizational memory.** The review's value multiplies when
   shared beyond the incident team:
   - **Sanitized incident reports**: Remove customer-specific data, exact IP addresses, and
     other sensitive details. Distribute the report to all engineering teams. The attack
     vector that hit Team A's service may exist in Team B's service.
   - **Pattern recognition**: After accumulating multiple reviews, analyze across incidents
     for recurring themes. If three incidents in six months involved missing input validation,
     that is a systemic gap in the development process, not three isolated incidents.
   - **Update threat models**: Use incident findings to update the organization's threat
     model. The incident proved that a theoretical threat is a practical reality. Adjust
     risk ratings and prioritize related defenses.
   - **Update runbooks**: If the response revealed gaps in existing runbooks (missing steps,
     outdated procedures, incorrect contact information), update them immediately.

6. **Measure incident response effectiveness over time.** Track metrics across incidents to
   identify trends:
   - **Mean Time to Detect (MTTD)**: Average time from initial compromise to detection. This
     metric reveals the effectiveness of monitoring and alerting.
   - **Mean Time to Contain (MTTC)**: Average time from detection to containment. This metric
     reveals the effectiveness of incident response processes and tooling.
   - **Mean Time to Remediate (MTTR)**: Average time from containment to full remediation
     (patching, hardening, recovery). This metric reveals engineering capacity for security
     work.
   - **Recurrence rate**: Percentage of incidents that are caused by the same root cause as a
     previous incident. A high recurrence rate means remediation actions are incomplete or
     ineffective.
   - **Remediation completion rate**: Percentage of post-incident remediation actions
     completed within their deadline. Track this monthly and report to leadership.

## Details

- **The Five Whys technique for security incidents**: The Five Whys is a root cause analysis
  technique that repeatedly asks "why" until the systemic cause is identified. For security
  incidents, the chain typically reveals: a proximate technical cause (a specific
  misconfiguration or bug), a process gap (why the misconfiguration was possible), a tooling
  gap (why the process gap was not caught automatically), an organizational gap (why the
  tooling gap existed), and a cultural or prioritization issue (why the organizational gap
  was not addressed). Stopping at the first or second "why" results in a tactical fix that
  does not prevent recurrence. The fifth "why" typically identifies a systemic issue that,
  when addressed, prevents an entire class of similar incidents.

- **Security-specific elements in post-incident reviews**: Beyond standard incident review
  elements, security PIRs should specifically analyze: the attack vector (how the attacker
  got in -- was it a known vulnerability, a zero-day, a social engineering attack, a supply
  chain compromise?), the attacker's dwell time (how long were they in the environment before
  detection? what were they doing during that time?), defense gap identification (which
  security controls existed and failed, which controls were missing entirely?), control
  effectiveness assessment (for each security control that should have detected or prevented
  the incident, why did it fail? misconfiguration, scope limitation, evasion by the
  attacker?), and data exposure assessment (exactly what data was accessed, copied, or
  exfiltrated -- this is critical for regulatory notification requirements).

- **Scaling review effort to incident severity**: Not every incident needs a 2-hour review
  with 12 participants. P4 incidents may need only a brief written analysis by the responder
  (15 minutes). P3 incidents warrant a 30-minute review with the response team. P2 incidents
  get the full structured review (60-90 minutes). P1 incidents may require multiple review
  sessions, external expertise, and executive participation. The key is that every incident
  gets some review -- even a brief one. The pattern of P4 incidents often reveals the leading
  indicators of future P1 incidents.

## Anti-Patterns

1. **Blame-focused reviews.** "Who is responsible for this?" The moment blame enters the room,
   candor leaves. Engineers stop sharing what they observed, withhold information about their
   own actions, and the review produces an incomplete picture. Future incidents are hidden or
   minimized to avoid blame. The organization's security posture degrades because it cannot
   learn from its failures.

2. **No follow-through on remediation items.** The review identifies 8 remediation actions.
   Two are completed in the first week because they are easy. The remaining six languish in
   the backlog, deprioritized in favor of feature work. Six months later, a similar incident
   occurs because the same gaps exist. Track remediation items with the same rigor as
   production bugs. Report completion rates to leadership.

3. **Writing the review but not distributing it.** The review document sits in a Confluence
   page that only the incident team has bookmarked. Other teams with the same vulnerability
   never learn about it. Distribute sanitized reports broadly. Present findings at engineering
   all-hands or security brown bags. Make the knowledge available where engineers will
   encounter it.

4. **Treating every incident the same.** Applying the full 90-minute structured review process
   to a P4 suspicious login alert wastes time and creates review fatigue. Applying a 15-minute
   informal review to a P1 data breach misses critical lessons. Scale the review depth to the
   incident severity. But never skip the review entirely -- even P4 incidents get a brief
   written analysis.

5. **No review at all.** The most dangerous anti-pattern. The incident is resolved, everyone
   goes back to their regular work, and the lessons evaporate. The same contributing factors
   remain in place. The same detection gaps exist. The same process weaknesses persist.
   Without a review, the organization is guaranteed to repeat its failures. The only variable
   is when, not whether.
