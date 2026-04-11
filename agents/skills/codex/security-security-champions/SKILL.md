# Security Champions Program

> Scale security knowledge across the engineering organization by embedding trained security
> advocates in every development team -- because the security team cannot review every line of
> code, but developers can

## When to Use

- The security team is a bottleneck and cannot keep up with the pace of development
- Security findings are discovered late in the SDLC because developers lack security awareness
- Starting a formal application security (AppSec) program and need to scale beyond the central
  security team
- Developers are resistant to security requirements because they perceive them as imposed by an
  external team
- Building a security culture where security is a shared responsibility, not a gatekeeping
  function
- Establishing a communication bridge between development teams and the security team

## Threat Context

The ratio of security engineers to software developers in most organizations ranges from 1:100
to 1:200. At this ratio, the security team cannot review every design, every pull request, or
every deployment. Security becomes a bottleneck: teams wait days or weeks for security reviews,
then ship without review when deadlines press. The result is that the majority of code reaches
production with no security review at all.

The 2021 Log4Shell vulnerability (CVE-2021-44228) demonstrated this scaling problem: the
vulnerability existed in a ubiquitous logging library for years, unnoticed by the security
community. Organizations that had security-aware developers in their teams -- developers who
understood the risk of passing untrusted input to logging functions -- were better positioned
to identify and remediate the issue quickly. Organizations without distributed security
knowledge spent weeks determining their exposure.

The BSIMM (Building Security In Maturity Model) study of 130+ organizations found that the
most mature security programs share a common characteristic: security knowledge is distributed
across development teams through satellite or champion models, not concentrated in a central
team. OWASP's Security Champions Guide and SAFECode's "Fundamental Practices for Secure Software
Development" both identify security champions as a critical scaling mechanism.

## Instructions

1. **Define the security champion role clearly.** A security champion is a developer who
   volunteers to be the security point of contact for their team. They are not a security
   engineer and do not replace the security team. Their responsibilities: participate in threat
   modeling sessions for their team's features, perform security-focused code review on
   sensitive changes (authentication, authorization, data handling, input validation), champion
   the use of security tools (SAST, SCA, secrets scanning) within their team, escalate complex
   security questions to the security team, and share security learnings with their team. The
   champion spends approximately 10-20% of their time on security activities.

2. **Select champions based on interest and aptitude, not assignment.** Mandatory participation
   creates resentment and produces disengaged champions. Seek volunteers who have demonstrated
   interest in security -- developers who ask security questions in code reviews, participate
   in CTF events, or proactively fix security issues. Technical aptitude matters: the champion
   must be a respected developer on their team so that their security feedback carries weight.
   Aim for at least one champion per development team (typically 1 per 6-10 developers).

3. **Provide structured training with progressive skill development.** Initial training (first
   month): OWASP Top 10 deep dive, threat modeling fundamentals, secure code review techniques,
   tool usage (running and interpreting SAST/SCA scans). Intermediate training (months 2-6):
   authentication and authorization design patterns, cryptography basics, API security, incident
   response awareness. Advanced training (ongoing): advanced attack techniques, security
   architecture review, mentoring new champions. Training should be hands-on: labs, CTF
   challenges, and real-world code review exercises, not just presentations.

4. **Establish a regular communication cadence.** Monthly security guild meetings: all champions
   meet to share findings, discuss new threats, review security tool updates, and learn from
   each other's experiences. A dedicated Slack or Teams channel for real-time security questions
   and knowledge sharing. Quarterly training sessions with the security team covering new attack
   techniques, tool updates, and organizational security priorities. A shared knowledge base
   (wiki, Confluence, Notion) with security checklists, design patterns, and decision records.

5. **Give champions dedicated time and recognition.** The champion role is additional work on top
   of regular development responsibilities. Without dedicated time, the champion role becomes
   unpaid overtime and champions burn out or disengage. Allocate 10-20% of the champion's
   sprint capacity for security activities. Include security champion contributions in
   performance reviews. Recognize champions publicly: newsletter mentions, conference talk
   sponsorship, security champion certification, or career path advancement that acknowledges
   the dual expertise.

6. **Define the escalation model between champions and the security team.** Champions handle
   routine security decisions within their team: reviewing PRs for common vulnerabilities,
   running threat models for standard features, configuring security tools. Champions escalate
   to the security team for: new or unusual attack patterns, architecture-level security
   decisions, incidents, compliance questions, and findings they are unsure about. The security
   team should respond to champion escalations within 24 hours -- slow response kills the
   program. The security team also provides mentorship, advanced training, and quality assurance
   of champion activities.

7. **Measure program effectiveness with actionable metrics.** Track: number of security findings
   identified in design review (by champions, not by penetration tests), mean time to remediate
   security findings (expect improvement as champions catch issues earlier), percentage of
   security-sensitive PRs reviewed by a champion before merge, champion engagement (attendance
   at guild meetings, Slack activity, escalations), and developer security awareness (periodic
   assessments or quiz scores). Report metrics quarterly and use them to adjust training,
   recognition, and program structure.

## Details

- **Program maturity stages**: Stage 1 (Foundation, months 1-3): identify and onboard initial
  champions, deliver foundational training, establish communication channels, define the
  champion role document. Stage 2 (Integration, months 4-6): integrate champion activities into
  team workflows (PR review assignments, sprint planning participation), establish escalation
  protocols, begin tracking metrics. Stage 3 (Optimization, months 7-12): advanced training
  program, champion-led threat modeling, champion mentoring new champions, data-driven program
  adjustments. Stage 4 (Scaling, year 2+): champion alumni network, champion-authored security
  guidelines, champions contributing to organizational security strategy.

- **OWASP Security Champions Guide**: The OWASP guide recommends a tiered model: Tier 1
  champions (all developers, basic security awareness), Tier 2 champions (dedicated per-team
  champions, intermediate training), Tier 3 champions (senior champions who mentor others and
  contribute to security policy). This tiered approach provides broad baseline awareness while
  concentrating deeper expertise where it is most needed.

- **BSIMM satellite model**: The Building Security In Maturity Model identifies three satellite
  roles: Security Champion (developer with security training who performs security-focused code
  review), Security Master (senior developer with advanced security expertise who conducts
  threat modeling and architecture review), and Software Security Group Contributor (developer
  who contributes to security team projects -- tool development, security library maintenance,
  security documentation). Organizations can start with champions and evolve to masters as the
  program matures.

- **Training resources for champions**: OWASP WebGoat and Juice Shop (hands-on vulnerable
  applications), PortSwigger Web Security Academy (free, comprehensive web security training),
  SANS SEC540 (Cloud Security and DevSecOps Automation), Secure Code Warrior (language-specific
  secure coding exercises), internal CTF events customized to the organization's technology
  stack. Prefer hands-on, application-level training over theoretical security certifications.

## Anti-Patterns

1. **Mandatory participation with no opt-out.** Forcing developers to be security champions
   creates resentment and produces champions who do the minimum to satisfy the requirement.
   Security champions must be volunteers who are genuinely interested in security. Mandatory
   security awareness training for all developers is appropriate; mandatory champion
   participation is counterproductive.

2. **No dedicated time -- champion role as unpaid overtime.** Telling developers to be security
   champions while keeping their sprint velocity expectations unchanged means security work
   happens evenings and weekends, or not at all. Without dedicated capacity (10-20% of sprint
   time), the program will lose champions to burnout within months.

3. **Security team uses champions as a triage dump.** Routing all security findings, compliance
   questionnaires, and vendor security reviews to champions because "they are the security
   person on the team." Champions are trained developers, not junior security analysts. They
   handle security within the software development workflow (code review, threat modeling, tool
   usage). Security operations, compliance, and vendor management remain the security team's
   responsibility.

4. **No career path or recognition for the champion role.** Developers who invest time in
   security skills and champion activities but receive no recognition in promotions, performance
   reviews, or compensation will eventually stop volunteering. Create a visible career path:
   champion -> senior champion -> security architect, or include security contributions as a
   factor in the engineering promotion criteria.

5. **Champions without training or authority.** Appointing champions but providing no training
   means they cannot identify vulnerabilities beyond the obvious. Appointing champions with no
   authority means their security feedback is ignored by the team. Champions need both:
   structured training that builds real expertise, and organizational backing that makes their
   security review a required (not optional) step in the development process.

6. **Single point of failure -- one champion per large team.** If a team of 15 developers has
   one champion and that champion goes on vacation, changes teams, or leaves the organization,
   the team has zero security coverage. Train at least two champions per team for redundancy,
   and maintain a champion alumni community so that former champions retain their security
   knowledge even after leaving the formal role.
