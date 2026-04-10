# Penetration Testing

> Hire skilled attackers to find the vulnerabilities your automated tools and internal reviews
> miss -- then fix what they find and verify the fixes

## When to Use

- Preparing for the first penetration test of a new application or infrastructure
- Scoping a penetration test engagement and writing the rules of engagement document
- Evaluating whether to use black box, gray box, or white box testing methodology
- Building a remediation tracking process for penetration test findings
- Deciding between penetration testing, vulnerability assessment, and red teaming
- Establishing a bug bounty program as a complement to periodic penetration testing
- Meeting compliance requirements that mandate periodic penetration testing (PCI-DSS, SOC2)

## Threat Context

Automated security tools (SAST, DAST, SCA) catch known vulnerability patterns but cannot find
business logic flaws, complex multi-step attack chains, or novel attack techniques. A DAST
scanner can find reflected XSS in a search field but cannot discover that an attacker can
escalate from a customer account to an admin account by manipulating the order of API calls in
a checkout flow. Penetration testers think like adversaries -- they chain vulnerabilities,
exploit business logic, and find attack paths that no automated tool can model.

The 2023 MOVEit Transfer zero-day (CVE-2023-34362) was a SQL injection vulnerability in a file
transfer application used by thousands of organizations. It was exploited at scale by the Cl0p
ransomware group before a patch was available. Organizations that had conducted thorough
penetration testing of their MOVEit deployments (including testing of the file transfer API
endpoints) had a better chance of discovering the SQL injection vector and implementing WAF rules
or compensating controls before the mass exploitation.

PCI-DSS Requirement 11.3 mandates annual penetration testing and retesting after significant
infrastructure or application changes. SOC2 Trust Services Criteria CC4.1 requires the entity to
evaluate and communicate internal control deficiencies, which penetration testing directly
supports. These are not just compliance checkboxes -- they are minimum expectations for security
assurance.

## Instructions

1. **Define the scope clearly and explicitly.** Scope determines the value of the test. Specify:
   target systems (URLs, IP ranges, APIs, mobile apps), testing methodology (black box: tester
   has no prior knowledge; gray box: tester has user-level credentials and API documentation;
   white box: tester has source code, architecture diagrams, and admin access), in-scope
   vulnerability classes (OWASP Top 10, business logic, API security, authentication bypass,
   privilege escalation), and explicitly out-of-scope systems (production databases with real
   customer data, third-party services, physical security). Gray box testing provides the best
   balance of realism and coverage for most applications.

2. **Establish rules of engagement before testing begins.** The rules of engagement are a legal
   and operational document that protects both parties. Include: written authorization from the
   system owner (without this, penetration testing is a criminal offense in most jurisdictions),
   testing window (dates and hours), communication channels (who to contact if a critical
   vulnerability is found or if the tester causes an outage), data handling requirements
   (how the tester handles any sensitive data encountered during testing -- it should be
   reported but not exfiltrated or retained), rate limits and intensity (to avoid causing
   denial of service), and escalation procedures.

3. **Choose a methodology appropriate to the engagement.** Established methodologies: OWASP
   Testing Guide (comprehensive web application testing methodology, 90+ test cases organized by
   category), PTES (Penetration Testing Execution Standard -- covers pre-engagement through
   reporting), OSSTMM (Open Source Security Testing Methodology Manual -- broad scope including
   human, physical, and digital security). For web applications, the OWASP Testing Guide is the
   most actionable. For comprehensive infrastructure testing, PTES provides better coverage. The
   methodology ensures systematic coverage and prevents the tester from spending all their time
   on one interesting finding while missing other critical vulnerabilities.

4. **Require actionable reporting with severity ratings.** Each finding should include: a
   severity rating (use CVSS or a risk-based rating that considers exploitability and business
   impact), a clear description of the vulnerability, step-by-step reproduction instructions
   (proof of concept), the business impact if exploited, specific remediation guidance (not just
   "fix the vulnerability" but "implement parameterized queries in the getUserById function at
   line 42 of user-controller.js"), and affected systems. The report should distinguish between
   findings that require immediate remediation and those that can be scheduled.

5. **Implement a remediation tracking workflow with SLAs.** Define remediation SLAs by severity:
   critical (actively exploitable, data exposure): 24-72 hours. High (exploitable with some
   complexity): 1-2 weeks. Medium (requires chaining or specific conditions): 30 days. Low
   (informational, defense-in-depth): 90 days. Track remediation in your issue tracker (not in
   the penetration test report). Assign each finding to a team with a specific owner. After
   remediation, request a verification retest from the penetration tester to confirm the fix is
   effective and did not introduce new vulnerabilities. Fix the root cause, not just the symptom.

6. **Distinguish penetration testing from vulnerability assessment and red teaming.** Vulnerability
   assessment: automated scanning plus manual verification, broad coverage, identifies known
   vulnerabilities. Penetration testing: manual exploitation, attempts to chain vulnerabilities
   to achieve specific objectives (access admin panel, exfiltrate data, move laterally).
   Red teaming: extended engagement (weeks to months), simulates a real adversary with specific
   objectives, tests detection and response capabilities as well as prevention. Each serves a
   different purpose. Most organizations need regular vulnerability assessments (monthly),
   periodic penetration tests (annually or after major changes), and occasional red team
   exercises (annually for mature security programs).

7. **Consider a bug bounty program for continuous testing.** Bug bounty programs (HackerOne,
   Bugcrowd, Intigriti, or self-hosted) provide continuous security testing by a large pool of
   researchers. Define a clear scope, reward structure (pay by severity, not by volume), and
   response SLAs. Bug bounties complement but do not replace structured penetration testing --
   bounty hunters optimize for quick wins, not systematic coverage. Start with a private program
   (invited researchers only) and expand to public after the initial surge of findings is
   addressed.

## Details

- **Black box vs gray box vs white box tradeoffs**: Black box (no prior knowledge) simulates an
  external attacker but is inefficient -- the tester spends significant time on reconnaissance
  that the client could provide. Gray box (user credentials, API docs, architecture overview)
  balances realism with efficiency and maximizes vulnerability discovery per hour of testing.
  White box (full source code access) maximizes coverage and is appropriate for security-critical
  applications, but findings may include vulnerabilities that are not practically exploitable.
  For most engagements, gray box provides the best return on investment.

- **OWASP Testing Guide structure**: Organized by category: Information Gathering, Configuration
  and Deployment Management, Identity Management, Authentication, Authorization, Session
  Management, Input Validation, Error Handling, Cryptography, Business Logic, Client-Side.
  Each test case includes a description, how to test, and remediation guidance. Version 4.2 is
  the current release. Use it as a checklist to ensure systematic coverage.

- **CVSS scoring for penetration test findings**: CVSS (Common Vulnerability Scoring System)
  provides a standardized severity score from 0 to 10. CVSS v3.1 components: Attack Vector
  (Network, Adjacent, Local, Physical), Attack Complexity (Low, High), Privileges Required
  (None, Low, High), User Interaction (None, Required), plus Impact metrics (Confidentiality,
  Integrity, Availability). While CVSS is useful for standardization, supplement it with
  business context: a CVSS 7.0 finding in a payment processing system is more urgent than a
  CVSS 9.0 finding in an internal documentation wiki.

- **Remediation verification**: After fixes are deployed, request a targeted retest covering each
  remediated finding. Verify that the fix addresses the root cause (parameterized queries) not
  just the symptom (input filter that can be bypassed). Check for regression: did the fix
  introduce new vulnerabilities or break existing security controls? The retest should be
  included in the original engagement scope and budget.

## Anti-Patterns

1. **Penetration testing as the only security activity.** Relying solely on annual pen tests
   means vulnerabilities introduced between tests are unknown for up to a year. Penetration
   testing is one layer of a defense-in-depth security program that includes threat modeling,
   SAST/DAST in CI, security code review, and security monitoring. A pen test validates the
   effectiveness of these other controls, not replaces them.

2. **Annual pen tests with no interim security testing.** A penetration test is a point-in-time
   assessment. An application that deploys weekly introduces 52 versions between annual pen
   tests. Supplement annual pen tests with continuous automated testing (SAST, DAST, SCA in CI)
   and periodic lightweight assessments after significant changes.

3. **Scope so narrow it misses real attack paths.** Testing only the web application frontend
   while ignoring the API, mobile app, third-party integrations, and internal services. An
   attacker does not respect scope boundaries. If the API is out of scope, the tester cannot
   find the IDOR vulnerability that exposes customer data via a direct API call. Define scope
   based on attack surface, not organizational convenience.

4. **No remediation tracking after the report.** Receiving a penetration test report, reading it,
   and filing it away. Without a formal tracking process, findings are forgotten, remediation
   is never verified, and the next year's pen test finds the same vulnerabilities. Every finding
   must become a tracked issue with an owner, a severity-based SLA, and a verification retest.

5. **Treating the pen test as pass/fail.** A penetration test is a learning opportunity, not an
   exam. "No critical findings" does not mean the application is secure -- it means the tester
   did not find critical vulnerabilities in the time and scope allocated. Review medium and low
   findings for systemic patterns (all medium findings relate to missing input validation?
   That is a training opportunity). Use findings to improve the SDLC, not just to patch
   individual vulnerabilities.

6. **Choosing testers solely on price.** The cheapest penetration test is often an automated
   scan with a cover letter. A skilled tester who spends two weeks manually testing business
   logic will find vulnerabilities that a budget "pen test" running Nessus and OWASP ZAP will
   miss entirely. Evaluate testers on methodology, relevant experience, sample reports, and
   certifications (OSCP, OSCE, GPEN, GXPN), not just cost.
