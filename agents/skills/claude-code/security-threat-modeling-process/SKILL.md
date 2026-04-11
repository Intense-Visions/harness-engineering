# Threat Modeling Process

> End-to-end threat modeling from system decomposition through threat enumeration, risk rating, and mitigation tracking -- the operational backbone of proactive security design

## When to Use

- Starting a new project or major feature and need to establish a threat model from scratch
- Integrating threat modeling into an existing SDLC for the first time
- Running a threat modeling workshop with a development team
- Reviewing whether an existing threat model is complete and current
- Preparing documentation for a SOC2, ISO 27001, or FedRAMP audit that requires evidence of threat analysis
- Onboarding a new team member who needs to understand the system's security posture quickly

## Threat Context

Systems that skip formal threat modeling consistently exhibit predictable vulnerability patterns: authentication bypasses on internal APIs assumed to be unreachable, unprotected administrative endpoints, missing encryption on sensitive data flows between services, and insufficient logging that makes incident response impossible. These are not exotic zero-day attacks -- they are foreseeable consequences of never asking "what could go wrong?" systematically.

The threat modeling process exists to make the implicit explicit before attackers do.

NIST estimates that vulnerabilities found in production are 6-10x more expensive to remediate than those identified during design. Threat modeling shifts security left to where it is cheapest and most effective.

## Instructions

1. **Scope the model.** Define system boundaries explicitly -- what is in-scope and what is out-of-scope for this threat modeling exercise. Name the assets worth protecting: user PII, financial transaction data, session tokens, API keys, cryptographic secrets, audit logs. Identify regulatory requirements (GDPR, HIPAA, PCI-DSS, SOC2) that impose specific security controls on in-scope data.

   A model without a defined scope either balloons to unworkable size or silently excludes critical components. Write the scope statement in the threat model document before drawing anything.

2. **Build the Data Flow Diagram.** Use standard DFD notation:
   - Rectangles for external entities (users, browsers, third-party APIs, partner systems)
   - Circles or rounded rectangles for processes (microservices, API endpoints, background workers, batch jobs)
   - Parallel lines for data stores (databases, caches, object storage, message queues treated as persistent stores)
   - Arrows for data flows

   Label every flow with the data it carries -- not "request/response" but "JWT token in Authorization header," "credit card number in POST body," "password hash read from users table." Ambiguous labels produce ambiguous threat analysis.

3. **Identify trust boundaries.** Every point where data crosses from one trust level to another is an attack surface. Draw dashed lines on the DFD at each boundary. Common trust boundaries include:
   - Browser to server (the internet boundary)
   - API gateway to backend service (the perimeter-to-application boundary)
   - Application to database (the application-to-data boundary)
   - Service to third-party API (the internal-to-external boundary)
   - CI/CD pipeline to production (the deployment boundary)

   See `security-trust-boundaries` for deep treatment of boundary analysis.

4. **Enumerate threats.** Apply a structured methodology to each DFD element and each trust boundary crossing. STRIDE is the most accessible for development teams (see `security-threat-modeling-stride`). PASTA (Process for Attack Simulation and Threat Analysis) is a 7-stage risk-centric process suited for mature security organizations. Attack trees provide depth analysis for individual high-value targets.

   Document each threat with: a unique ID, a natural-language description following the form "An attacker could [action] by [method], resulting in [impact]," the affected DFD component, the threat category, and the specific data or asset at risk.

5. **Rate risk.** Assign each threat a risk score using one of two common frameworks:
   - **DREAD**: Damage potential (0-10), Reproducibility (0-10), Exploitability (0-10), Affected users (0-10), Discoverability (0-10). Average the five scores. Simple but subjective.
   - **Likelihood x Impact matrix**: Rate likelihood (Low/Medium/High) and impact (Low/Medium/High) independently. Multiply for a 9-cell risk matrix. Less granular but faster and more consistent across raters.

   Whichever framework you choose, apply it consistently across all threats. Mixed rating systems produce incomparable priorities. Rank threats by composite score in descending order.

6. **Define mitigations.** For each threat above the risk acceptance threshold, specify:
   - The mitigation control (the specific technical measure)
   - The implementation owner (the person or team responsible)
   - The target completion date
   - The verification criterion (a test case, configuration check, or observable behavior that confirms the mitigation is in place)

   Mitigations without owners do not get implemented. Mitigations without verification criteria cannot be audited.

7. **Track and iterate.** Store the threat model alongside the codebase -- a `docs/security/threat-model.md` file or a dedicated section in the project wiki that is versioned with the code.

   Review the model quarterly at minimum and on every significant architecture change (new service, new data store, new external integration, new deployment target). Add new threats as features are added. Close mitigated threats with evidence (link to the PR that implemented the control, the test that verifies it, or the configuration that enforces it). A threat model that is not maintained decays into a false sense of security.

## Details

### Choosing a Methodology

**STRIDE** is the best starting point for development teams new to threat modeling. Its mnemonic structure provides a checklist that prevents category omission, and its element-based approach maps naturally to system architecture diagrams that developers already understand. Limitation: STRIDE is classification-oriented -- it tells you what categories of threats exist but does not inherently prioritize them or model attacker behavior chains.

**PASTA** (Process for Attack Simulation and Threat Analysis) is a 7-stage risk-centric framework: define objectives, define technical scope, application decomposition, threat analysis, vulnerability analysis, attack modeling, and risk/impact analysis. PASTA produces more rigorous output than STRIDE because it incorporates business impact analysis and attacker simulation, but it requires more security expertise and more time. Best suited for organizations with dedicated application security teams.

**Attack trees** model how an attacker achieves a specific goal by decomposing it into sub-goals connected by AND/OR logic. An attack tree for "steal user credentials" might decompose into "exploit SQL injection OR phish an admin OR compromise a backup," with each branch decomposing further. Attack trees provide depth that STRIDE and PASTA do not, but they analyze one goal at a time rather than surveying the whole system.

For most teams, the recommended approach is: STRIDE for breadth (survey the whole system), then attack trees for depth (analyze the top 5 threats in detail).

### Running a Threat Modeling Workshop

A 90-minute workshop with 4-6 participants is the most effective format for producing a threat model that the team understands and owns.

**Participants**: 2 developers who built the system, 1 architect who designed it, 1 security engineer (or the most security-aware team member), 1 QA engineer, and 1 product owner who understands business impact. If no dedicated security engineer is available, the architect assumes that role.

**Structure**:

- **First 20 minutes**: Draw the DFD on a whiteboard or shared diagram tool. The developers drive this -- they know the actual data flows, not just the designed ones. Mark trust boundaries.
- **Next 40 minutes**: Walk each trust boundary. For each boundary crossing, apply STRIDE. The security engineer leads questioning; developers answer with system knowledge. Record every identified threat on sticky notes or in a shared document.
- **Final 30 minutes**: Prioritize threats using the risk matrix. Assign the top threats to owners with target dates. Decide on accept/mitigate/transfer for each.

**Output**: A threat register document committed to the repository within 24 hours of the workshop. The document becomes a living artifact updated in subsequent sprints.

### Lightweight Threat Modeling for Agile Teams

For teams that cannot dedicate 90 minutes, integrate threat modeling into existing ceremonies:

**Per-story threat check (5 minutes during backlog refinement)**: For each user story, ask three questions:

1. Does this story introduce a new data flow, external entity, or data store to the DFD?
2. Does this story cross an existing trust boundary in a new way?
3. Does this story handle sensitive data (PII, credentials, financial data) that was not previously in scope?

If any answer is "yes," add a STRIDE analysis task to the story's acceptance criteria.

**Architecture Decision Record (ADR) threat appendix**: When writing an ADR for a significant architecture change, append a threat analysis section that applies STRIDE to the new or modified components. This catches threats at the decision point rather than after implementation.

### Tooling

- **Microsoft Threat Modeling Tool** (free): Generates STRIDE threats automatically from a DFD drawn in the tool. Windows-only. Produces HTML reports suitable for audit evidence.
- **OWASP Threat Dragon** (open source, web-based): DFD editor with manual threat enumeration. Cross-platform. Stores models as JSON files that can be committed to version control.
- **IriusRisk** (commercial): Automated threat generation from architecture patterns. Integrates with Jira for mitigation tracking. Suited for enterprises with multiple product teams.
- **Markdown tables in the repo**: For teams without tooling budget, a structured Markdown file with columns for threat ID, description, STRIDE category, risk score, mitigation, owner, and status is sufficient and has the advantage of being versioned, diffable, and reviewable in pull requests.

### Threat Model Document Structure

A complete threat model document stored in the repository should contain these sections:

1. **Header**: Model name, version, date, authors, review status
2. **Scope**: What is in-scope, what is explicitly out-of-scope, which assets are being protected, applicable regulations
3. **Data Flow Diagram**: Visual diagram with trust boundaries marked, plus a text legend explaining each element
4. **Trust Boundary Inventory**: Table of all identified trust boundaries with the data classification and transport mechanism for each
5. **Threat Register**: Table of all identified threats with ID, description, STRIDE category, risk score, mitigation, owner, status, and verification criterion
6. **Assumptions**: Security assumptions the model depends on (e.g., "the cloud provider's IAM is not compromised," "TLS 1.3 is correctly configured on the load balancer")
7. **Open Questions**: Unresolved items that need further investigation before the model is complete
8. **Revision History**: Dated entries showing when the model was updated and what changed

Store this as `docs/security/threat-model.md` or in a `security/` directory within the project. The document must be reviewable in pull requests so that architecture changes trigger threat model updates in the same review cycle.

### Metrics for Threat Modeling Effectiveness

Track these metrics to assess whether threat modeling is producing value:

- **Threats identified per model**: A model with fewer than 10 threats for a non-trivial system suggests insufficient analysis. A model with more than 100 suggests scope creep or insufficient abstraction.
- **Percentage mitigated before release**: Target 100% of high-risk and medium-risk threats mitigated before production deployment. Low-risk threats may be deferred with documented acceptance.
- **Mean time from identification to mitigation**: Measures how quickly the team acts on identified threats. Increasing time suggests the threat model is disconnected from the development workflow.
- **Post-release vulnerability correlation**: The most important metric. If post-release findings were already in the threat model but unmitigated, the process identified the threat but the team failed to act. If post-release findings were not in the threat model, the enumeration was incomplete. Both failure modes are diagnostic.

## Anti-Patterns

1. **Threat modeling after implementation.** If the system is already built and deployed, the threat model becomes a retrospective documentation exercise rather than a design influence. Threats found post-implementation are dramatically more expensive to remediate because they require rework of existing code, re-testing of deployed functionality, and often coordination of a security patch release. Model before you build. The cheapest vulnerability to fix is the one you designed out.

2. **Security team owns the threat model alone.** When the security team produces the threat model in isolation and hands it to developers as a list of mandates, two things go wrong: developers do not understand the reasoning behind the controls (and therefore implement them incorrectly or resentfully), and the threat model does not reflect the actual system (because the security team does not know all the data flows). The development team must participate in and co-own the threat model.

3. **DFD too detailed or too abstract.** A DFD with 50 processes is unworkable -- applying STRIDE to each element produces hundreds of threats, most of which are low-value duplicates. A DFD with 2 boxes ("frontend" and "backend") misses all internal threats, all service-to-service attack vectors, and all data store risks. Target 5-15 DFD elements per model. If a subsystem is high-risk (e.g., the authentication service), decompose it into its own DFD at a finer granularity and run a separate threat model.

4. **No risk rating.** Listing 200 threats without prioritization leads to analysis paralysis. The development team stares at a wall of threats and does not know where to start. Not all threats are equal -- a low-likelihood, low-impact information disclosure on a public status page is not comparable to a high-likelihood, high-impact elevation of privilege on the admin API. Rate them, rank them, and address the top 10 first.

5. **Confusing threat modeling with penetration testing.** Threat modeling is a design-time analytical activity that identifies what could go wrong based on the system's architecture. Penetration testing is a validation-time empirical activity that confirms whether specific vulnerabilities exist in the running system. Threat modeling without penetration testing is unverified theory. Penetration testing without threat modeling is undirected probing. They are complementary -- threat modeling tells you where to look; penetration testing tells you what you actually find.

6. **Treating threat modeling as a document, not a process.** Teams that produce a polished PDF threat model and file it away have completed a documentation exercise, not a security activity. The value of threat modeling is in the ongoing conversation it creates -- the team's shared understanding of where the system is vulnerable and what trade-offs were made. Update the model when the architecture changes, review it during sprint planning, and reference it when making design decisions.
