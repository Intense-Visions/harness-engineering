# Incident Containment

> The first 60 minutes of a security incident determine whether the organization loses days
> of data or months of data -- containment is not about fixing the vulnerability, it is about
> stopping the bleeding while preserving the evidence needed to understand what happened

## When to Use

- A security incident has been detected or suspected and immediate response is needed
- Building or reviewing an incident response plan before an incident occurs
- Defining severity classification and escalation procedures for security events
- Establishing evidence preservation procedures for compromised systems
- Designing network isolation and credential rotation runbooks
- Preparing communication plans for breach notification (GDPR 72-hour requirement)

## Threat Context

The cost of a security incident scales directly with containment time. IBM's Cost of a Data
Breach Report consistently shows that organizations that contain breaches within 30 days
save over $1 million compared to those that take longer:

- **SolarWinds (2020)**: The SUNBURST backdoor was present in SolarWinds Orion updates from
  March to June 2020. It was not detected until December 2020 -- a 9-month dwell time.
  During that period, the attacker (attributed to Russian SVR) accessed email systems at
  multiple US government agencies and private companies. The extended dwell time was possible
  because the initial compromise mimicked legitimate software behavior and the attack blended
  with normal network traffic.
- **Target (2013)**: Attackers compromised Target's network through an HVAC vendor. Despite
  security tools generating alerts, the team did not act on them. The attackers had 2 weeks
  of uncontained access to install malware on point-of-sale systems, exfiltrating 40 million
  credit card numbers and 70 million customer records. The breach cost Target $292 million.
- **Marriott (2018)**: The breach of Starwood's reservation system began in 2014 and was not
  detected until 2018 -- a 4-year dwell time. The system was compromised before Marriott
  acquired Starwood, and the lack of security assessment during the acquisition allowed the
  breach to continue. 500 million guest records were exposed.
- **NotPetya (2017)**: A destructive wiper disguised as ransomware spread through a Ukrainian
  accounting software update mechanism. Organizations without network segmentation lost their
  entire Windows infrastructure within hours. Maersk lost 49,000 laptops, 4,000 servers, and
  all domain controllers. Rapid containment through network isolation was the only defense
  once the wiper was active.

## Instructions

1. **Follow the NIST SP 800-61 incident response lifecycle.** The four phases are
   Preparation, Detection and Analysis, Containment Eradication and Recovery, and
   Post-Incident Activity. Each phase has specific objectives:
   - **Preparation**: Before an incident occurs -- build the team, define roles, establish
     communication channels, prepare tools and runbooks, conduct tabletop exercises. An
     organization that has not prepared will improvise under pressure, making critical mistakes.
   - **Detection and Analysis**: Confirm the incident is real (not a false positive), assess
     the scope and severity, begin documentation. Every observation and decision from this
     point forward must be recorded with timestamps.
   - **Containment, Eradication, and Recovery**: Stop the attacker's access, remove their
     presence from the environment, restore systems to a known-good state. These three
     sub-phases often overlap.
   - **Post-Incident Activity**: Conduct a post-incident review, update defenses, improve
     detection capabilities. This phase is covered in the security-post-incident-review skill.

2. **Execute the first 60 minutes with discipline.** The initial response period is the most
   critical and the most prone to mistakes:
   - **Minute 0-5: Confirm and classify.** Is this a real incident or a false positive?
     Classify severity: P1 (active data exfiltration or destructive attack in progress), P2
     (confirmed compromise with attacker presence but no active exfiltration detected), P3
     (vulnerability identified that could lead to compromise), P4 (suspicious activity that
     requires investigation).
   - **Minute 5-15: Activate the response team.** Notify the incident commander, technical
     lead, communications lead, and legal counsel. Use a pre-established communication channel
     (dedicated Slack channel, bridge call, war room). Do not use the potentially compromised
     corporate email system for sensitive incident details.
   - **Minute 15-30: Begin evidence preservation.** Before taking any containment action that
     modifies system state, capture volatile evidence: memory dumps, network connection state,
     running process lists, and active session data. Once containment actions begin, this
     evidence is altered or destroyed.
   - **Minute 30-60: Execute initial containment.** Based on the incident type, execute the
     appropriate containment strategy. Document every action taken and its timestamp.

3. **Apply the correct containment strategy for the incident type.** Different incidents
   require different containment approaches:
   - **Compromised user account**: Disable the account, revoke all active sessions, rotate
     the password and any API keys or tokens the user had access to. Review the account's
     recent activity for data access, privilege changes, or lateral movement.
   - **Compromised server/instance**: Isolate the system from the network (change security
     group rules to deny all traffic except from the forensics workstation). Do not shut it
     down -- memory forensics requires the system to remain running. Capture a memory dump
     and disk image from the isolated system.
   - **Active data exfiltration**: Block the exfiltration destination at the network perimeter
     (firewall, DNS sinkhole). If the exfiltration channel cannot be identified, isolate the
     source system. Begin assessing what data was accessible from the compromised system.
   - **Ransomware/destructive malware**: Isolate affected network segments immediately to
     prevent lateral spread. Identify and protect backup systems -- attackers increasingly
     target backups before deploying ransomware. Do not pay ransom without legal counsel and
     law enforcement consultation.
   - **Supply chain compromise**: Identify all systems running the compromised component.
     Block the component's update mechanism. Assess whether the compromise included a
     backdoor, data exfiltration, or was limited to the update channel.

4. **Preserve evidence before remediation.** Evidence preservation is not optional -- it is
   required for understanding the full scope of the incident, for potential legal proceedings,
   and for improving defenses:
   - **Do not reboot compromised systems.** Rebooting destroys volatile memory, which may
     contain the attacker's tools, decryption keys, active connections, and process artifacts
     that are essential for understanding the attack.
   - **Capture disk images before patching or reimaging.** A bit-for-bit disk image preserves
     deleted files, file system timestamps, and artifacts that the attacker may have tried to
     remove. Image the disk to a separate, clean storage device.
   - **Preserve logs from all sources.** Export logs from the compromised system, load
     balancers, firewalls, DNS servers, authentication systems, and any other infrastructure
     that may contain evidence of the attacker's activity. Ensure log integrity by hashing
     the exported files.
   - **Document the timeline.** Record every observation, decision, and action with a
     timestamp. This timeline is the foundation of the post-incident review and any legal or
     regulatory reporting.

5. **Establish and follow the communication plan.** Incident communication is as critical as
   technical containment:
   - **Internal notification chain**: Define who is notified at each severity level. P1
     incidents notify the CISO, CTO, CEO, and legal counsel immediately. P2 incidents notify
     the security team lead and engineering leadership. P3/P4 follow standard escalation.
   - **External notification requirements**: GDPR Article 33 requires breach notification to
     the supervisory authority within 72 hours of becoming aware of a breach involving personal
     data. HIPAA requires notification to HHS within 60 days for breaches affecting 500+
     individuals. PCI-DSS requires notification to the payment card brands and acquiring bank.
   - **Customer communication**: If customer data is affected, prepare a notification that
     describes what happened (factually, without speculation), what data was affected, what
     actions the customer should take, and what the organization is doing to prevent recurrence.
   - **Law enforcement**: For significant breaches, consult legal counsel about engaging law
     enforcement (FBI, local authorities). Law enforcement may provide threat intelligence
     about the attacker and their methods.

## Details

- **Severity classification framework in depth**: P1 (Critical) -- active data exfiltration,
  destructive attack in progress, complete compromise of authentication infrastructure, or
  ransomware actively spreading. Response SLA: immediate, all-hands. P2 (High) -- confirmed
  attacker presence in the environment (e.g., backdoor found, unauthorized access to
  sensitive systems) but no evidence of active exfiltration or destruction. Response SLA: 1
  hour. P3 (Medium) -- exploitable vulnerability discovered in production, credential
  exposure (e.g., secrets committed to a public repository), or phishing campaign targeting
  employees. Response SLA: 4 hours. P4 (Low) -- suspicious activity requiring investigation,
  security tool alert of uncertain significance, or minor policy violation. Response SLA:
  next business day.

- **Network isolation techniques**: Security group modification is the fastest cloud-native
  isolation method -- modify the instance's security group to deny all inbound and outbound
  traffic except from a designated forensics jump host. VLAN isolation moves the compromised
  system to an isolated network segment. DNS sinkholing redirects the attacker's command-and-
  control domain to a controlled IP address, severing the C2 channel without alerting the
  attacker that they have been detected. Each technique has trade-offs between speed of
  implementation, evidence preservation, and attacker awareness.

- **Credential rotation scope and sequencing**: When a system is compromised, assume all
  credentials accessible from that system are compromised. This includes: service account
  passwords, API keys in environment variables or configuration files, database connection
  strings, TLS private keys, SSH keys, and any secrets in the process's memory. Rotate in
  order of blast radius: domain admin credentials first, then service accounts with broad
  access, then application-specific credentials. Monitor for the rotated credentials being
  used after rotation -- this indicates the attacker has a persistence mechanism that captures
  new credentials.

## Anti-Patterns

1. **Rebooting the compromised system.** The instinct to "restart and see if it fixes it"
   destroys volatile evidence: memory contents, network connections, running processes, and
   cached credentials. Memory forensics can reveal the attacker's tools, their command-and-
   control infrastructure, and what data they accessed. Reboot only after memory and disk have
   been imaged.

2. **Immediately patching without understanding the full scope.** Patching the exploited
   vulnerability on the compromised system does not remove the attacker -- they likely
   established persistence mechanisms (backdoor accounts, scheduled tasks, web shells,
   modified binaries) on the compromised system and may have moved laterally to other systems.
   Patching gives a false sense of security while the attacker maintains access through their
   other footholds.

3. **No predefined incident response plan.** Every incident becomes ad-hoc. The team wastes
   the critical first hour deciding who should do what, what tools to use, and who to notify.
   Decisions made under pressure without a plan are consistently worse than decisions made
   calmly during preparation. Conduct tabletop exercises quarterly and update runbooks based
   on lessons learned.

4. **Single point of failure in the response team.** Only one person knows the runbooks, has
   access to the forensics tools, or can authorize containment actions. If that person is
   unavailable (vacation, sick, different time zone), the response is paralyzed. Cross-train
   at least two people for every critical response role.

5. **Notification delays.** Delaying breach notification to avoid bad press or in hopes that
   the incident turns out to be less severe than feared. GDPR mandates 72-hour notification
   to the supervisory authority. Delayed notification increases legal liability, regulatory
   fines, and reputational damage when the delay becomes public. Start the notification clock
   at the moment of awareness and communicate factually about what is known and unknown.
