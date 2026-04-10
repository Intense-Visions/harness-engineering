# STRIDE Threat Modeling

> Systematic threat identification using the six STRIDE categories -- Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege

## When to Use

- Designing a new system or service and need to enumerate threats before writing code
- Reviewing an existing architecture for security gaps
- Preparing for a security review or compliance audit
- Adding a new data flow, API, or integration point to an existing system
- Training team members to think adversarially about system design
- Building a threat register for risk prioritization
- Evaluating whether a third-party component introduces new trust boundaries or attack surface

## Threat Context

STRIDE was developed at Microsoft by Loren Kohnfelder and Praerit Garg in 1999 and remains the most widely adopted threat classification framework. It provides a mnemonic decomposition that maps directly to security properties: Spoofing violates authentication, Tampering violates integrity, Repudiation violates non-repudiation, Information Disclosure violates confidentiality, Denial of Service violates availability, and Elevation of Privilege violates authorization. Attackers exploit systems along these six axes -- STRIDE ensures no axis is overlooked during design.

## Instructions

1. **Decompose the system into a Data Flow Diagram (DFD).** Identify external entities (users, third-party services), processes (application logic, microservices), data stores (databases, caches, file systems), and data flows (API calls, message queues, file transfers). Each element becomes a threat target.

   Use standard DFD notation: rectangles for external entities, circles or rounded rectangles for processes, parallel lines for data stores, and arrows for data flows. Label every arrow with the data it carries. A DFD that says "request" and "response" is too vague -- label it "JWT token in Authorization header" or "credit card number in POST body."

2. **Apply STRIDE to each DFD element systematically.** Not every STRIDE category applies to every element type. Use the element-to-threat mapping:
   - **External entities**: Spoofing, Repudiation
   - **Processes**: All six -- Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
   - **Data stores**: Tampering, Information Disclosure, Denial of Service
   - **Data flows**: Tampering, Information Disclosure, Denial of Service

   Walk through each DFD element in turn. For each applicable STRIDE category, ask: "How could an attacker achieve this goal against this specific component?" If you cannot articulate a concrete attack, the category may not apply to that element -- but document the reasoning, not just the conclusion.

3. **Document each threat with precision.** Use the canonical form: "An attacker could [action] by [method], resulting in [impact]." Include:
   - Threat ID (e.g., T-001)
   - Affected component (the specific DFD element)
   - STRIDE category
   - Likelihood (Low / Medium / High)
   - Impact (Low / Medium / High)
   - Proposed mitigation

   Vague threats like "an attacker could hack the database" are useless. Specific threats like "an attacker could extract user credentials from the PostgreSQL database by exploiting a SQL injection in the /api/search endpoint, resulting in bulk credential theft" are actionable.

4. **Prioritize using risk = likelihood x impact.** High-likelihood, high-impact threats get mitigated first. Low-likelihood, low-impact threats are accepted with documentation.

   Use a 3x3 risk matrix to visualize the distribution. If more than 60% of threats cluster in the high-risk quadrant, the architecture has systemic security weaknesses that require design changes, not just point mitigations.

5. **Map mitigations to the STRIDE-to-security-property table.** Each STRIDE category has a corresponding security property and a family of standard controls:
   - **Spoofing** -> Authentication: MFA, X.509 certificates, API keys with rotation, mutual TLS
   - **Tampering** -> Integrity: HMAC, digital signatures, checksums, immutable append-only logs, content hashing
   - **Repudiation** -> Non-repudiation: Structured audit logs with tamper-evident storage, digital signatures on transactions, synchronized timestamps
   - **Information Disclosure** -> Confidentiality: Encryption at rest (AES-256-GCM) and in transit (TLS 1.3), access controls, data classification and masking, secure error handling that suppresses internals
   - **Denial of Service** -> Availability: Rate limiting, autoscaling, circuit breakers, request size limits, connection pooling, geographic redundancy
   - **Elevation of Privilege** -> Authorization: RBAC or ABAC, principle of least privilege, input validation, secure defaults, sandboxing

6. **Iterate per sprint or per feature, not just once at project inception.** Every new feature introduces new DFD elements -- a new API endpoint is a new process, a new third-party integration is a new external entity, a new cache layer is a new data store. Run STRIDE on the delta. The threat model is a living artifact that evolves with the system.

## Details

### STRIDE-per-Element vs STRIDE-per-Interaction

The original STRIDE formulation (per-element) applies the six categories to each DFD component independently. STRIDE-per-interaction, introduced later by Microsoft SDL practitioners, applies STRIDE to each data flow that crosses a trust boundary.

Per-interaction is more thorough for distributed systems because it focuses analysis on the attack surface -- the boundary crossings -- rather than exhaustively enumerating all components. For monolithic applications, per-element is sufficient. For microservices architectures with dozens of inter-service calls, per-interaction scales better and produces more actionable results because every analyzed tuple (source, destination, data flow, trust boundary) maps directly to a specific network call that can be hardened.

The choice between the two approaches also affects team workflow. Per-element analysis can be parallelized across team members (each person takes a subset of DFD elements). Per-interaction analysis requires understanding the full data flow path and is better suited to group workshops where developers can trace a request end-to-end.

### Worked Example

Consider a web application with four components: a browser client, an API gateway, an authentication service, and a PostgreSQL database.

- **Spoofing**: An attacker forges a JWT token by exploiting a weak signing algorithm (HS256 with a guessable secret) to impersonate another user. Mitigation: use RS256 with a 2048-bit key pair, validate `iss` and `aud` claims, enforce short expiration.

- **Tampering**: An attacker modifies the JSON request body between the browser client and API gateway (via a proxy or browser devtools) to change the `role` field from "user" to "admin." Mitigation: never accept role or privilege fields from the client; derive authorization from the server-side session.

- **Repudiation**: A user performs a destructive action (deleting records) and denies it. No audit trail exists because the application only logs errors, not business actions. Mitigation: log all state-changing operations with actor identity, timestamp, resource affected, and action type to a tamper-evident log store.

- **Information Disclosure**: The API gateway returns verbose SQL error messages to the client when a query fails, exposing table names, column names, and query structure. Mitigation: return generic error responses to clients; log detailed errors server-side only.

- **Denial of Service**: The search endpoint accepts unbounded queries with no pagination limit. An attacker sends `GET /api/search?q=*&limit=1000000`, causing the database to perform a full table scan and exhausting connection pool resources. Mitigation: enforce maximum page size (e.g., 100), require pagination, add query timeout at the database level.

- **Elevation of Privilege**: The API uses sequential integer IDs for resources (`/api/orders/1234`). An attacker increments the ID to access another user's order (IDOR -- Insecure Direct Object Reference). Mitigation: use UUIDs for external-facing resource identifiers, enforce ownership checks on every resource access.

### STRIDE and Compliance Mapping

STRIDE categories map directly to established compliance frameworks, making threat models reusable as audit evidence:

- **Spoofing** -> NIST 800-53 IA (Identification and Authentication) -> OWASP Top 10 A07 (Identification and Authentication Failures)
- **Tampering** -> NIST 800-53 SI (System and Information Integrity) -> OWASP Top 10 A03 (Injection)
- **Repudiation** -> NIST 800-53 AU (Audit and Accountability) -> OWASP Top 10 A09 (Security Logging and Monitoring Failures)
- **Information Disclosure** -> NIST 800-53 SC (System and Communications Protection) -> OWASP Top 10 A01 (Broken Access Control) and A02 (Cryptographic Failures)
- **Denial of Service** -> NIST 800-53 SC and CP (Contingency Planning) -> not directly in OWASP Top 10 (availability is out of scope for OWASP)
- **Elevation of Privilege** -> NIST 800-53 AC (Access Control) -> OWASP Top 10 A01 (Broken Access Control)

This mapping allows a single threat modeling exercise to serve both the development team (prioritizing mitigations) and the compliance team (demonstrating control coverage). When preparing for SOC2 Type II or ISO 27001 audits, a STRIDE-based threat model with NIST control family references provides direct evidence of risk assessment activities.

### Threat Documentation Template

A well-structured threat register entry contains:

| Field                  | Example                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**                 | T-007                                                                                                                                                                     |
| **Title**              | JWT Token Forgery via Weak Signing Algorithm                                                                                                                              |
| **STRIDE Category**    | Spoofing                                                                                                                                                                  |
| **Description**        | An attacker could impersonate any user by forging a JWT token signed with HS256 using a brute-forced shared secret, resulting in unauthorized access to all user accounts |
| **Affected Component** | API Gateway (process)                                                                                                                                                     |
| **Trust Boundary**     | Browser -> API Gateway                                                                                                                                                    |
| **Likelihood**         | High (HS256 secrets are frequently weak or default)                                                                                                                       |
| **Impact**             | High (full account takeover)                                                                                                                                              |
| **Risk Score**         | High (H x H)                                                                                                                                                              |
| **Mitigation**         | Switch to RS256 with 2048-bit key pair; validate iss, aud, and exp claims; rotate keys quarterly                                                                          |
| **Owner**              | Auth team                                                                                                                                                                 |
| **Status**             | Open                                                                                                                                                                      |
| **Verification**       | Integration test confirms RS256 enforcement; HS256-signed tokens are rejected                                                                                             |

This format ensures every threat is specific enough to act on, assigned to an owner, and verifiable when mitigated. Avoid free-text-only threat registers -- tabular formats enforce completeness and make gaps visible.

### When STRIDE Is Insufficient

STRIDE covers security threats to software systems but has known blind spots:

- **Privacy**: STRIDE does not address privacy threats. Use LINDDUN for privacy-specific threat modeling: Linkability, Identifiability, Non-repudiation, Detectability, Disclosure of information, Unawareness, Non-compliance.
- **Supply chain**: Compromised dependencies, build pipeline poisoning, and artifact tampering require frameworks like SLSA (Supply-chain Levels for Software Artifacts) or the NIST Cybersecurity Supply Chain Risk Management (C-SCRM) practices.
- **Physical and social**: Physical security, social engineering, and insider threats are outside STRIDE's scope entirely.
- **Multi-stage attacks**: STRIDE categorizes individual threats but does not model attack chains where multiple low-severity findings combine into a critical exploit path. For modeling adversary behavior across multiple stages, use kill chain analysis (Lockheed Martin Cyber Kill Chain or MITRE ATT&CK).

For high-security systems, the recommended approach is: STRIDE for comprehensive single-threat enumeration, supplemented with attack trees for depth analysis on the highest-value assets.

### Output Quality Indicators

A high-quality STRIDE analysis has these characteristics:

- Every DFD element has at least one threat documented (even if the disposition is "accepted -- risk is negligible"). Elements with zero threats suggest the analysis skipped them.
- No STRIDE category is entirely absent from the threat register. If an entire category (e.g., Repudiation) has zero entries, the team likely overlooked it or does not understand it.
- Mitigations reference specific controls, not vague intentions. "Improve security" is not a mitigation. "Add HMAC-SHA256 signature verification on the webhook payload at the ingress handler" is a mitigation.
- The risk distribution is not uniform. If every threat is rated "Medium/Medium," the team is not differentiating. Push for honest assessment -- some threats are high risk and some are low risk.

## Anti-Patterns

1. **Applying STRIDE without a DFD.** Brainstorming threats against "the application" as a whole produces vague, unactionable results. STRIDE requires concrete DFD elements to attach threats to. Without a DFD, teams fixate on perimeter threats and miss internal attack vectors -- service-to-service privilege escalation, data store tampering via batch jobs, and repudiation through unlogged internal APIs.

2. **One-and-done threat modeling.** Running STRIDE once during initial design and never revisiting the model. Every new feature, API endpoint, data store, or integration changes the DFD and introduces new threat targets. A threat model from six months ago does not cover the three microservices added last sprint. Treat the threat model as a living document -- update it in the same PR that changes the architecture.

3. **Listing threats without mitigations.** A threat register that identifies 47 risks but proposes no mitigations is a liability inventory, not a security activity. Every identified threat must have one of three dispositions: mitigate (specify the control and the owner), accept (document the risk acceptance decision and the approver), or transfer (specify the party assuming the risk, e.g., cyber insurance, third-party service SLA).

4. **Confusing STRIDE categories with vulnerabilities.** "SQL injection" is not a STRIDE category -- it is a specific vulnerability class that maps to Tampering (the attacker modifies the intended query) and Information Disclosure (the attacker extracts data the query was not designed to return). STRIDE categories describe the attacker's strategic goals; vulnerabilities are the tactical mechanisms used to achieve those goals. Mixing the levels of abstraction produces threat models that duplicate vulnerability scan output rather than informing architecture.

5. **Skipping the prioritization step.** Treating all identified threats as equally urgent produces analysis paralysis and diffuses engineering effort. A threat model with 80 equally-weighted items leads to either complete inaction or arbitrary cherry-picking. Use risk scoring (likelihood x impact) to create a ranked backlog. Address the top 10 threats in the current release; schedule the next 20 for the following release; accept or monitor the remainder.

6. **Using STRIDE as a one-person exercise.** Threat modeling done by a single security engineer in isolation misses the domain knowledge that developers and architects bring. The team that builds the system understands its nuances -- the undocumented caching layer, the legacy endpoint that bypasses the API gateway, the batch job that runs with elevated privileges. Run STRIDE as a collaborative workshop, not a solo audit.
