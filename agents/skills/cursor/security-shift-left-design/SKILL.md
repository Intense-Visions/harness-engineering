# Shift-Left Security Design

> Find security flaws in the design document, not in the penetration test report -- because
> fixing an architecture flaw costs 100x more after deployment than during design

## When to Use

- Starting the design phase of a new feature, service, or system that handles sensitive data
- Conducting a design review and need a structured approach to identifying security concerns
- Integrating security into agile ceremonies without creating bottlenecks
- Building a secure SDLC process for an organization that currently does security only in QA
- Evaluating whether a proposed architecture has fundamental security weaknesses before writing
  code
- Defining security requirements alongside functional requirements for a new project

## Threat Context

The NIST/IBM Systems Sciences Institute data on defect cost escalation shows that a security flaw
found in the design phase costs 1x to fix, in implementation costs 6.5x, in testing costs 15x,
and in production costs 100x. These numbers are not theoretical -- they reflect the difference
between changing a design document and performing an emergency production deployment with data
breach notification, incident response, customer communication, and regulatory reporting.

The 2017 Equifax breach (CVE-2017-5638, Apache Struts) exposed 147 million records. The
vulnerability was in a third-party component, but the architectural failure was deeper: the
application ran with direct access to a database containing 147 million unencrypted SSNs, with no
network segmentation, no data access monitoring, and no principle of least privilege. These are
design-phase decisions. A threat model during design would have identified that a single web
application vulnerability should not grant access to the entire consumer database.

Organizations that defer security analysis to the testing phase consistently find architectural
flaws that cannot be fixed without redesigning the system. At that point, the choice is between
shipping an insecure architecture or missing the deadline by months. Shift-left security ensures
that security-critical design decisions are made when they are cheapest and easiest to change.

## Instructions

1. **Elicit security requirements alongside functional requirements.** For every user story or
   feature specification, ask: What data does this feature access, store, or transmit? Who is
   authorized to use this feature? What happens if this feature is abused? What compliance
   requirements apply? Security requirements are not separate from functional requirements --
   they are constraints on how functionality is implemented. Document them in the same backlog
   and give them the same priority as functional requirements.

2. **Conduct a threat model for every new feature that changes the trust boundary.** Not every
   feature needs a full STRIDE analysis, but any feature that introduces a new data flow, a new
   external integration, a new user role, or a new API endpoint should have a lightweight threat
   model. Use the "four question" approach: What are we building? What can go wrong? What are we
   going to do about it? Did we do a good job? This takes 30-60 minutes in a design review
   meeting and identifies architectural vulnerabilities that no scanner will find.

3. **Integrate security checkpoints into agile ceremonies.** Sprint planning: review new stories
   for security implications. Design review: include a "security considerations" section in every
   design document. Definition of done: include "threat model reviewed" and "security
   requirements addressed" alongside "tests pass" and "code reviewed." Retrospective: review
   security findings from the sprint and adjust processes. These are lightweight additions to
   existing ceremonies, not new meetings.

4. **Create and maintain a security design review checklist.** The checklist should cover:
   authentication (how does the feature verify user identity?), authorization (who can perform
   which actions on which resources?), input validation (what inputs does the feature accept and
   how are they validated?), data protection (is sensitive data encrypted at rest and in
   transit?), logging (what security-relevant events does this feature produce?), error handling
   (do error messages leak internal details?), and dependency risk (what new dependencies does
   this feature introduce?). The checklist is a starting point, not a substitute for thinking.

5. **Use abuse cases alongside use cases.** For every use case ("User uploads a profile photo"),
   write the corresponding abuse case ("Attacker uploads a PHP webshell as a profile photo,"
   "Attacker uploads a 10GB file to exhaust storage," "Attacker uploads an image with EXIF GPS
   data harvesting"). Abuse cases force the team to think adversarially during design, not after
   deployment. They also produce concrete test cases for the QA team.

6. **Establish architecture-level security patterns as defaults.** Reduce the design-phase
   security burden by establishing organizational defaults: all inter-service communication uses
   mTLS, all data stores encrypt at rest, all APIs require authentication, all user input is
   validated against a schema, all sensitive operations produce audit events. When these are
   defaults, the design review focuses on feature-specific risks rather than relitigating
   baseline security decisions.

7. **Track security design decisions as architectural decision records (ADRs).** When a design
   review produces a security-relevant decision (using JWT instead of session cookies, choosing
   row-level security over application-level filtering, accepting a specific risk with
   mitigation), record it as an ADR. This creates a searchable history of why security decisions
   were made, prevents relitigating resolved decisions, and provides context for future threat
   model updates.

## Details

- **The cost curve of defect remediation**: IBM Systems Sciences Institute and NIST data show
  exponential cost increases as defects move through the SDLC. Design phase: 1x (change the
  document). Implementation phase: 6.5x (rewrite code, update tests). Testing phase: 15x
  (fix code, retest, delay release). Production phase: 100x (emergency patch, incident response,
  customer notification, regulatory reporting, reputation damage). The Ponemon Institute's Cost
  of a Data Breach Report (2023) puts the average cost of a data breach at $4.45 million, with
  breaches caused by security system complexity and cloud migration failures (both design-phase
  issues) costing significantly more.

- **Security requirements elicitation techniques**: OWASP Application Security Verification
  Standard (ASVS) provides a comprehensive checklist of security requirements organized by
  level (L1: opportunistic, L2: standard, L3: advanced). Use ASVS as a requirements source
  during design. Microsoft's Security Development Lifecycle (SDL) provides security requirements
  templates. NIST SP 800-53 provides security control families for federal systems. Map
  compliance requirements (SOC2, PCI-DSS, HIPAA) to specific security requirements early.

- **Lightweight threat modeling for agile teams**: The full STRIDE-per-element analysis is too
  heavyweight for every sprint. Use rapid threat modeling: 15-minute session during design
  review, focused on the specific feature being built. Draw the data flow diagram for the new
  feature on a whiteboard, identify trust boundaries, and brainstorm threats at each boundary
  crossing. Document findings as backlog items. This scales to agile velocity.

- **Security design review triggers**: Not every code change needs a security review. Define
  triggers: new authentication or authorization logic, new data stores for sensitive data, new
  external integrations or API endpoints, changes to encryption or key management, new user
  roles or permission models, infrastructure changes (new services, network changes). Changes
  that do not cross a trust boundary can proceed without security design review.

## Anti-Patterns

1. **Security review as a gatekeeping bottleneck.** When the security team must approve every
   design before development can start, security becomes a scheduling constraint that teams work
   around rather than with. Instead, embed security knowledge in development teams (security
   champions), provide self-service design review checklists, and reserve the security team's
   direct involvement for high-risk features that cross trust boundaries.

2. **Treating threat modeling as a document rather than a design influence.** A threat model
   produced to satisfy a process requirement and then filed away provides no security value. The
   purpose of threat modeling is to change the design. If the threat model does not result in
   at least one design modification, backlog item, or accepted-risk decision, it was either done
   too late or not taken seriously.

3. **The "security sprint" anti-pattern.** Batching all security work into a dedicated sprint
   (usually before a release) means security issues accumulate for weeks, are rushed through in a
   compressed timeline, and the fixes are inadequately tested. Security is a continuous concern,
   not a batch process. Integrate security requirements into every sprint, address findings as
   they are discovered, and include security criteria in the definition of done for every story.

4. **Relying solely on automated scanning without design-phase analysis.** SAST and DAST tools
   find implementation bugs (SQL injection, XSS, buffer overflows) but cannot find architectural
   flaws (missing authorization checks, improper trust boundaries, insecure data flows, lack of
   rate limiting). A design that routes all traffic through a single unauthenticated API gateway
   is an architectural vulnerability that no scanner will detect. Design-phase analysis and
   automated scanning are complementary, not substitutes.

5. **Security requirements as non-functional requirements.** Labeling security as "non-functional"
   marginalizes it. Security requirements are functional constraints: "the API must reject
   requests without a valid authentication token" is as functional as "the API must return user
   data in JSON format." Treat security requirements with the same priority, tracking, and
   testing discipline as any other requirement.

6. **One-time threat model never updated.** A threat model created during initial design and
   never revisited becomes stale as the system evolves. New features, new integrations, and new
   threat intelligence change the risk landscape. Review and update threat models when
   significant changes are made to the system, or at minimum quarterly for high-risk systems.
