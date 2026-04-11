# Plan: Security Fundamentals Phase 1 -- Core Skills

**Date:** 2026-04-09
**Spec:** docs/changes/security-fundamentals-knowledge-skills/proposal.md
**Estimated tasks:** 17
**Estimated time:** 85 minutes

## Goal

Create the 15 foundational security knowledge skills (Phase 1) that teach durable, framework-agnostic security principles -- the conceptual layer beneath the existing `owasp-*` implementation checklists.

## Observable Truths (Acceptance Criteria)

1. 15 skill directories exist under `agents/skills/claude-code/` with names matching the Phase 1 list: `security-threat-modeling-stride`, `security-threat-modeling-process`, `security-trust-boundaries`, `security-symmetric-encryption`, `security-asymmetric-encryption`, `security-hashing-fundamentals`, `security-credential-storage`, `security-session-management`, `security-rbac-design`, `security-zero-trust-principles`, `security-tls-fundamentals`, `security-secrets-lifecycle`, `security-audit-log-design`, `security-memory-safety`, `security-injection-families`.
2. Each of the 15 directories contains a `SKILL.md` (150-250 lines) and a `skill.yaml`.
3. Every `SKILL.md` contains all 7 required sections in order: H1 title, blockquote tagline, When to Use, Threat Context, Instructions, Details, Anti-Patterns.
4. Every `skill.yaml` has `type: knowledge`, `cognitive_mode: advisory-guide`, `tier: 3`, `platforms` listing all four platforms, and at least one `owasp-*` skill in `related_skills` where a topical match exists.
5. Identical copies of each skill directory exist under `agents/skills/gemini-cli/`, `agents/skills/cursor/`, and `agents/skills/codex/` (60 directories total = 15 skills x 4 platforms).
6. No framework-specific implementation code appears in any SKILL.md -- only pseudocode and language-agnostic patterns.
7. Every Threat Context section names specific attack classes (not vague "security risks").
8. `harness validate` passes after all skills are created.

## File Map

### CREATE (60 directories, 120 files -- listed for claude-code, replicated to 3 other platforms)

Per-skill (repeated for each of 15 skills):

- `agents/skills/claude-code/security-<topic>/SKILL.md`
- `agents/skills/claude-code/security-<topic>/skill.yaml`

15 skills:

- `security-threat-modeling-stride`
- `security-threat-modeling-process`
- `security-trust-boundaries`
- `security-symmetric-encryption`
- `security-asymmetric-encryption`
- `security-hashing-fundamentals`
- `security-credential-storage`
- `security-session-management`
- `security-rbac-design`
- `security-zero-trust-principles`
- `security-tls-fundamentals`
- `security-secrets-lifecycle`
- `security-audit-log-design`
- `security-memory-safety`
- `security-injection-families`

Cross-platform copies (45 directories, 90 files):

- `agents/skills/gemini-cli/security-<topic>/SKILL.md` (x15)
- `agents/skills/gemini-cli/security-<topic>/skill.yaml` (x15)
- `agents/skills/cursor/security-<topic>/SKILL.md` (x15)
- `agents/skills/cursor/security-<topic>/skill.yaml` (x15)
- `agents/skills/codex/security-<topic>/SKILL.md` (x15)
- `agents/skills/codex/security-<topic>/skill.yaml` (x15)

## Skeleton (approved)

1. Threat Modeling skills (~3 tasks, ~15 min)
2. Cryptography Primitives skills (~3 tasks, ~15 min)
3. Auth, AuthZ, Zero Trust, Transport, Secrets, Audit, Vulnerability skills (~9 tasks, ~45 min)
4. Cross-platform replication and validation (~2 tasks, ~10 min)

**Estimated total:** 17 tasks, ~85 minutes

_Skeleton approved: yes._

## Tasks

---

### Task 1: security-threat-modeling-stride

**Depends on:** none
**Files:** `agents/skills/claude-code/security-threat-modeling-stride/SKILL.md`, `agents/skills/claude-code/security-threat-modeling-stride/skill.yaml`

1. Create directory `agents/skills/claude-code/security-threat-modeling-stride/`.

2. Create `skill.yaml`:

```yaml
name: security-threat-modeling-stride
version: '1.0.0'
description: STRIDE methodology for systematic threat identification across spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-threat-modeling-process
  - security-trust-boundaries
  - security-attack-trees
  - owasp-injection-prevention
  - owasp-auth-patterns
  - owasp-csrf-protection
stack_signals: []
keywords:
  - stride
  - threat modeling
  - spoofing
  - tampering
  - repudiation
  - information disclosure
  - denial of service
  - elevation of privilege
  - threat identification
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `SKILL.md` with the following content requirements (150-250 lines):

**H1 Title:** `# STRIDE Threat Modeling`

**Tagline:** `> Systematic threat identification using the six STRIDE categories -- Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege`

**When to Use section** -- bullet list of scenarios:

- Designing a new system or service and need to enumerate threats before writing code
- Reviewing an existing architecture for security gaps
- Preparing for a security review or compliance audit
- Adding a new data flow, API, or integration point to an existing system
- Training team members to think adversarially about system design
- Building a threat register for risk prioritization

**Threat Context section** (2-4 sentences):
STRIDE was developed at Microsoft by Loren Kohnfelder and Praerit Garg in 1999 and remains the most widely adopted threat classification framework. It provides a mnemonic decomposition that maps directly to security properties: Spoofing violates authentication, Tampering violates integrity, Repudiation violates non-repudiation, Information Disclosure violates confidentiality, Denial of Service violates availability, and Elevation of Privilege violates authorization. Attackers exploit systems along these six axes -- STRIDE ensures no axis is overlooked during design.

**Instructions section** -- numbered steps with expert-level guidance:

1. **Decompose the system into a Data Flow Diagram (DFD).** Identify external entities (users, third-party services), processes (application logic, microservices), data stores (databases, caches, file systems), and data flows (API calls, message queues, file transfers). Each element becomes a threat target.
2. **Apply STRIDE to each DFD element systematically.** Use the element-to-threat mapping table:
   - External entities: Spoofing, Repudiation
   - Processes: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege (all six)
   - Data stores: Tampering, Information Disclosure, Denial of Service
   - Data flows: Tampering, Information Disclosure, Denial of Service
3. **For each threat, document:** (a) the threat description in the form "An attacker could [action] by [method] resulting in [impact]", (b) the affected component, (c) the STRIDE category, (d) likelihood (Low/Medium/High), (e) impact (Low/Medium/High), (f) proposed mitigation.
4. **Prioritize using risk = likelihood x impact.** High-likelihood, high-impact threats get mitigated first. Low-likelihood, low-impact threats are accepted with documentation.
5. **Map mitigations to the STRIDE-to-security-property table:**
   - Spoofing -> Authentication (MFA, certificates, API keys)
   - Tampering -> Integrity (HMAC, digital signatures, checksums, immutable logs)
   - Repudiation -> Non-repudiation (audit logs, digital signatures, timestamps)
   - Information Disclosure -> Confidentiality (encryption at rest/transit, access controls, data classification)
   - Denial of Service -> Availability (rate limiting, autoscaling, circuit breakers, redundancy)
   - Elevation of Privilege -> Authorization (RBAC/ABAC, principle of least privilege, input validation)
6. **Iterate per-sprint or per-feature**, not just once at project inception. Every new feature introduces new DFD elements. Run STRIDE on the delta.

**Details section** -- deep dives:

- **STRIDE-per-Element vs STRIDE-per-Interaction**: Explain the difference. Per-element applies STRIDE to each DFD component. Per-interaction applies STRIDE to each data flow crossing a trust boundary. Per-interaction is more thorough and scales better for microservices because it focuses on the attack surface (boundaries) rather than the full component inventory.
- **Worked example**: A web application with a browser client, API gateway, auth service, and PostgreSQL database. Walk through identifying at least one threat per STRIDE category: Spoofing (forged JWT tokens), Tampering (modified request body between client and gateway), Repudiation (user denies performing an action with no audit trail), Information Disclosure (SQL error messages leaking schema), DoS (unbounded query on a search endpoint), EoP (horizontal privilege escalation via IDOR).
- **STRIDE and compliance**: Map STRIDE categories to NIST 800-53 control families and OWASP Top 10 categories. Spoofing maps to NIST IA (Identification and Authentication) and OWASP A07 (Identification and Authentication Failures). Tampering maps to NIST SI (System and Information Integrity) and OWASP A03 (Injection). Information Disclosure maps to NIST SC (System and Communications Protection) and OWASP A01 (Broken Access Control).
- **When STRIDE is insufficient**: STRIDE does not cover supply chain threats, social engineering, or physical security. For those, supplement with LINDDUN (privacy), attack trees, or kill chain analysis.

**Anti-Patterns section:**

1. **Applying STRIDE without a DFD.** Brainstorming threats against "the application" produces vague, unactionable results. STRIDE requires concrete DFD elements to attach threats to. Without a DFD, teams miss threats on internal components and focus only on the perimeter.
2. **One-and-done threat modeling.** Running STRIDE once during initial design and never revisiting. Every new feature, API endpoint, or data flow changes the DFD and introduces new threat targets. Treat the threat model as a living document.
3. **Listing threats without mitigations.** A threat register that identifies risks but proposes no mitigations is a liability inventory, not a security activity. Every identified threat must have a mitigation, acceptance decision, or transfer decision.
4. **Confusing STRIDE categories with vulnerabilities.** "SQL injection" is not a STRIDE category -- it is a vulnerability that maps to Tampering (modifying the query) and Information Disclosure (extracting data). STRIDE categories are the attacker's goals; vulnerabilities are the mechanisms.
5. **Skipping the prioritization step.** Treating all threats as equally urgent produces paralysis. Use risk scoring (likelihood x impact) to sequence mitigation effort.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-threat-modeling-stride knowledge skill`

---

### Task 2: security-threat-modeling-process

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/security-threat-modeling-process/SKILL.md`, `agents/skills/claude-code/security-threat-modeling-process/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-threat-modeling-process
version: '1.0.0'
description: End-to-end threat modeling process -- from scoping and DFD construction through threat enumeration, risk rating, and mitigation tracking
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-threat-modeling-stride
  - security-trust-boundaries
  - security-attack-trees
  - owasp-auth-patterns
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - threat modeling
  - threat model
  - data flow diagram
  - DFD
  - risk assessment
  - security design review
  - threat register
  - mitigation tracking
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Threat Modeling Process`
**Tagline:** `> End-to-end threat modeling from system decomposition through threat enumeration, risk rating, and mitigation tracking -- the operational backbone of proactive security design`

**When to Use:**

- Starting a new project or major feature and need to establish a threat model from scratch
- Integrating threat modeling into an existing SDLC for the first time
- Running a threat modeling workshop with a development team
- Reviewing whether an existing threat model is complete and current
- Preparing documentation for a SOC2, ISO 27001, or FedRAMP audit that requires evidence of threat analysis

**Threat Context:**
Systems that skip formal threat modeling consistently exhibit predictable vulnerability patterns: authentication bypasses, unprotected internal APIs, missing encryption on sensitive data flows, and insufficient logging. These are not exotic attacks -- they are foreseeable consequences of never asking "what could go wrong?" systematically. The threat modeling process exists to make the implicit explicit before attackers do.

**Instructions** -- the complete 7-step process:

1. **Scope the model.** Define system boundaries, identify what is in-scope vs out-of-scope. Name the assets worth protecting (user PII, financial data, session tokens, API keys). Identify regulatory requirements (GDPR, HIPAA, PCI-DSS) that constrain design.
2. **Build the Data Flow Diagram.** Use standard DFD notation: rectangles for external entities, circles/rounded rectangles for processes, parallel lines for data stores, arrows for data flows. Label every flow with the data it carries (e.g., "JWT token", "credit card number", "password hash"). Mark trust boundaries with dashed lines.
3. **Identify trust boundaries.** Every point where data crosses from one trust level to another is an attack surface. Common boundaries: browser-to-server, server-to-database, service-to-service across network zones, internal-to-third-party API.
4. **Enumerate threats.** Apply a structured methodology (STRIDE, PASTA, or attack trees) to each element and boundary. Document each threat with: ID, description, affected component, category, and the specific data or asset at risk.
5. **Rate risk.** Use DREAD (Damage, Reproducibility, Exploitability, Affected users, Discoverability) or a simpler Likelihood x Impact matrix. Assign numeric scores. Rank threats by composite score.
6. **Define mitigations.** For each threat above the risk acceptance threshold: specify the mitigation control, the implementation owner, the target completion date, and how to verify the mitigation works (test case or observable criterion).
7. **Track and iterate.** Store the threat model alongside the codebase (e.g., `docs/security/threat-model.md`). Review quarterly and on every significant architecture change. Add new threats as features are added. Close mitigated threats with evidence.

**Details:**

- **Choosing a methodology**: STRIDE is best for developers new to threat modeling (mnemonic structure, element-based). PASTA (Process for Attack Simulation and Threat Analysis) is a 7-stage risk-centric framework better suited for organizations with mature security programs. Attack trees are best for deep analysis of a single high-value target. Use STRIDE for breadth, attack trees for depth.
- **Workshop format**: A 90-minute threat modeling workshop with 4-6 participants (2 developers, 1 architect, 1 security engineer, 1 QA, 1 product owner). First 20 minutes: draw DFD on whiteboard. Next 40 minutes: walk each trust boundary and enumerate threats. Final 30 minutes: prioritize and assign mitigations. Output: threat register document committed to repo.
- **Lightweight for agile teams**: For teams that cannot dedicate 90 minutes, use "threat modeling every story" -- a 5-minute check on each user story during backlog refinement: "Does this story introduce a new data flow, external entity, or trust boundary? If yes, add STRIDE analysis to the acceptance criteria."
- **Tooling**: Microsoft Threat Modeling Tool (free, generates STRIDE threats from DFD), OWASP Threat Dragon (open source, web-based DFD editor with threat enumeration), IriusRisk (commercial, automated threat generation). For teams without tooling budget, a Markdown table in the repo is sufficient.
- **Metrics**: Track number of threats identified per model, percentage mitigated before release, mean time from threat identification to mitigation, and number of post-release vulnerabilities that were in the threat model vs. missed.

**Anti-Patterns:**

1. **Threat modeling after implementation.** If the system is already built, the threat model becomes a retrospective documentation exercise rather than a design influence. Threats found post-implementation are 6-10x more expensive to remediate (NIST estimate). Model before you build.
2. **Security team owns the threat model alone.** Developers who did not participate in threat modeling do not understand the threats and cannot make secure design decisions. The development team must participate in and own the threat model.
3. **DFD too detailed or too abstract.** A DFD with 50 processes is unworkable for threat enumeration. A DFD with 2 boxes ("frontend" and "backend") misses all internal threats. Target 5-15 DFD elements per model. Decompose further for high-risk subsystems.
4. **No risk rating.** Listing 200 threats without prioritization leads to analysis paralysis. Not all threats are equal. Rate them, rank them, and address the top 10 first.
5. **Confusing threat modeling with penetration testing.** Threat modeling is a design-time activity that identifies what could go wrong. Penetration testing is a validation activity that confirms whether vulnerabilities exist. They are complementary, not substitutes.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-threat-modeling-process knowledge skill`

---

### Task 3: security-trust-boundaries

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/security-trust-boundaries/SKILL.md`, `agents/skills/claude-code/security-trust-boundaries/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-trust-boundaries
version: '1.0.0'
description: Trust boundary identification, data flow diagrams, and the principle that all security controls concentrate at boundary crossings
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-threat-modeling-stride
  - security-threat-modeling-process
  - security-zero-trust-principles
  - security-microsegmentation
  - owasp-injection-prevention
  - owasp-auth-patterns
stack_signals: []
keywords:
  - trust boundary
  - trust zone
  - data flow diagram
  - DFD
  - attack surface
  - network segmentation
  - defense in depth
  - perimeter
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Trust Boundaries`
**Tagline:** `> Every security control exists because data crosses from a trusted zone to a less-trusted one -- identify the boundaries first, then concentrate defenses there`

**When to Use:**

- Drawing or reviewing a system architecture diagram and need to identify where security controls belong
- Designing a microservices architecture and need to determine which service-to-service calls require authentication
- Evaluating whether an internal API needs the same input validation as a public API
- Planning network segmentation or firewall rules
- Assessing the blast radius of a compromised component

**Threat Context:**
The majority of exploitable vulnerabilities exist at trust boundary crossings -- the points where data moves between zones of different privilege levels. SQL injection occurs at the boundary between application code and database. XSS occurs at the boundary between server-generated content and the browser's rendering engine. SSRF occurs at the boundary between user-controlled input and server-side HTTP clients. If you cannot draw your trust boundaries, you cannot reason about where your controls should be.

**Instructions:**

1. **Enumerate trust zones.** A trust zone is a region where all components share the same trust level. Common zones: public internet (untrusted), DMZ (partially trusted), application tier (trusted), database tier (highly trusted), secrets management (maximally trusted). Cloud environments add zones: VPC, subnet, security group, pod network, sidecar proxy.
2. **Draw boundaries between zones.** Every point where data crosses from one zone to another is a trust boundary. Mark these with dashed lines on architecture diagrams. Label each boundary with the direction of data flow and the data classification (public, internal, confidential, restricted).
3. **Apply the boundary security principle.** At every trust boundary crossing: validate all input (never trust data from a less-trusted zone), authenticate the caller (verify identity before processing), authorize the action (verify permission for the specific operation), encrypt data in transit (TLS minimum, mTLS for service-to-service in zero-trust architectures), and log the crossing (who, what, when, from where).
4. **Classify boundary types:**
   - **Network boundaries**: Firewall rules, load balancers, API gateways, VPN endpoints
   - **Process boundaries**: IPC, shared memory, pipes, sockets between processes on the same host
   - **Application boundaries**: Module imports, function calls across security domains (e.g., admin module calling user module)
   - **Data boundaries**: Encryption/decryption points, serialization/deserialization, encoding/decoding
5. **Assess blast radius per zone.** If an attacker compromises a component in zone X, what can they reach? The answer defines the blast radius. Minimize blast radius by: limiting cross-zone access to explicit allow-lists, applying least privilege to service accounts, and using separate credentials per zone.
6. **Validate boundary effectiveness.** For each boundary, verify: Can an unauthenticated request cross it? Can a request from a lower-trust zone bypass validation? Can data exfiltrate across it without logging? If any answer is "yes," the boundary has a gap.

**Details:**

- **The implicit trust boundary problem**: Most vulnerabilities arise from implicit boundaries that developers do not recognize as boundaries. Example: a microservice that accepts JSON from another internal service. Developers assume "it is internal, so it is trusted" -- but if the calling service is compromised, the implicit trust becomes an attack vector. Treat every deserialization point as a trust boundary.
- **Cloud-native boundaries**: In Kubernetes, trust boundaries exist at: ingress controller (internet to cluster), service mesh sidecar (pod to pod), namespace boundaries (logical isolation), node boundaries (VM-level isolation), and cloud IAM boundaries (service account permissions). Each layer adds a boundary crossing with its own authentication and authorization requirements.
- **Zero trust and the dissolution of the perimeter**: Traditional architecture has one hard boundary (the network perimeter) with a soft interior. Zero trust treats every component boundary as a trust boundary. This is not about adding more firewalls -- it is about making every service authenticate and authorize every request regardless of network position. See `security-zero-trust-principles` for the full model.
- **Data classification drives boundary strength**: Not all boundaries need the same controls. A boundary protecting public marketing content needs basic input validation. A boundary protecting PII needs encryption, authentication, authorization, audit logging, and rate limiting. Match control strength to data sensitivity.

**Anti-Patterns:**

1. **The "trusted internal network" assumption.** Assuming that anything inside the VPC/firewall is safe. Internal networks are compromised routinely (lateral movement is the most common post-exploitation technique). Every service-to-service call crosses a trust boundary, even within the same network.
2. **Validating input at the perimeter only.** Placing all input validation at the API gateway and trusting everything downstream. If any downstream service is reachable by another path (message queue, batch job, admin endpoint), the validation is bypassed. Validate at every boundary crossing.
3. **Symmetric trust across an asymmetric boundary.** Two services that mutually trust each other equally when the data flow is asymmetric. If Service A sends user-controlled data to Service B, then B must validate that data even if A is "trusted" -- because A might be relaying attacker input.
4. **Missing deserialization boundaries.** Deserializing data (JSON.parse, pickle.loads, Java ObjectInputStream) without treating the deserialization point as a trust boundary. Deserialization is code execution. Every deserialization of data from a less-trusted source must validate schema, reject unexpected types, and limit payload size.

5. Run: `harness validate`
6. Commit: `feat(skills): add security-trust-boundaries knowledge skill`

---

### Task 4: security-symmetric-encryption

**Depends on:** none
**Files:** `agents/skills/claude-code/security-symmetric-encryption/SKILL.md`, `agents/skills/claude-code/security-symmetric-encryption/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-symmetric-encryption
version: '1.0.0'
description: AES and ChaCha20 symmetric ciphers, modes of operation (GCM vs CBC vs CTR), key sizes, IV/nonce management, and authenticated encryption
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-asymmetric-encryption
  - security-hashing-fundamentals
  - security-hmac-signatures
  - security-cryptographic-randomness
  - security-tls-fundamentals
  - owasp-cryptography
stack_signals: []
keywords:
  - AES
  - ChaCha20
  - symmetric encryption
  - GCM
  - CBC
  - CTR
  - authenticated encryption
  - AEAD
  - cipher
  - encryption key
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Symmetric Encryption`
**Tagline:** `> AES-256-GCM for most use cases, ChaCha20-Poly1305 when hardware AES is unavailable -- always use authenticated encryption, never roll your own`

**When to Use:**

- Encrypting data at rest (database fields, file storage, backups)
- Encrypting data in application-layer protocols (beyond TLS)
- Choosing between AES and ChaCha20 for a specific deployment target
- Selecting a mode of operation (GCM, CBC, CTR) for a symmetric cipher
- Reviewing code that performs encryption for correctness
- Designing a key management scheme for encrypted data

**Threat Context:**
Symmetric encryption defends against confidentiality breaches when an attacker gains access to stored data (stolen database dumps, compromised backups, unauthorized file system access) or intercepts data in transit. Without authenticated encryption (AEAD), an attacker can also tamper with ciphertext without detection -- the padding oracle attack against AES-CBC (CVE-2014-3566, POODLE) demonstrated this at scale, enabling plaintext recovery through ciphertext manipulation.

**Instructions:**

1. **Default to AES-256-GCM.** AES (Advanced Encryption Standard, Rijndael) with 256-bit keys in GCM (Galois/Counter Mode) provides both confidentiality and integrity (authenticated encryption with associated data -- AEAD). GCM produces a 128-bit authentication tag that detects any ciphertext modification. AES-256-GCM is NIST-approved, FIPS 140-2 compliant, and hardware-accelerated on all modern x86 (AES-NI) and ARM (ARMv8 Crypto Extensions) processors.
2. **Use ChaCha20-Poly1305 when AES hardware acceleration is unavailable.** ChaCha20 is a stream cipher designed by Daniel Bernstein. Combined with Poly1305 MAC, it provides AEAD equivalent to AES-GCM. ChaCha20-Poly1305 is faster in software on devices without AES-NI (IoT, older mobile). TLS 1.3 includes both AES-256-GCM and ChaCha20-Poly1305 as mandatory cipher suites.
3. **Never use unauthenticated modes in new systems.** AES-CBC (Cipher Block Chaining) without a separate HMAC is vulnerable to padding oracle attacks. AES-ECB (Electronic Codebook) is structurally broken -- identical plaintext blocks produce identical ciphertext blocks, leaking patterns. AES-CTR without a MAC allows undetected ciphertext tampering.
4. **Generate IVs/nonces correctly.** GCM requires a unique 96-bit nonce per encryption operation under the same key. Nonce reuse under GCM is catastrophic -- it reveals the XOR of two plaintexts and the authentication key. Use a CSPRNG for random nonces, or use a deterministic construction (AES-GCM-SIV) if nonce uniqueness cannot be guaranteed.
5. **Key sizes: 256-bit for future-proofing.** AES-128 is not broken and is sufficient against classical computers. AES-256 provides margin against theoretical quantum attacks (Grover's algorithm reduces effective strength to 128-bit, still secure). For new systems, use 256-bit keys.
6. **Key derivation from passwords.** Never use a password directly as an encryption key. Derive keys using Argon2id, scrypt, or PBKDF2 with a unique salt and sufficient iterations. The derived key must be the exact length required by the cipher (32 bytes for AES-256).
7. **Encrypt-then-MAC if forced to use CBC.** If a legacy system requires AES-CBC, apply HMAC-SHA256 to the ciphertext (not the plaintext). Verify the MAC before decrypting. This is the encrypt-then-MAC construction and is provably secure. MAC-then-encrypt and encrypt-and-MAC are both vulnerable to specific attack classes.

**Details:**

- **Modes of operation comparison table**: GCM (AEAD, parallelizable, nonce-sensitive), CBC (confidentiality only, sequential, needs separate MAC, padding oracle risk), CTR (confidentiality only, parallelizable, needs separate MAC, nonce-sensitive), GCM-SIV (AEAD, nonce-misuse resistant, slight performance penalty), XTS (disk encryption, not for general use).
- **The nonce reuse catastrophe**: Illustrate with GCM: if nonce N is reused with key K for plaintexts P1 and P2, an attacker recovers P1 XOR P2 (the XOR of the plaintexts) and the GHASH authentication key H. With H, the attacker can forge authentication tags for arbitrary ciphertexts. This is not theoretical -- nonce reuse in GCM has been exploited in TLS implementations.
- **Associated data (the "AD" in AEAD)**: GCM and ChaCha20-Poly1305 support additional authenticated data (AAD) -- data that is integrity-protected but not encrypted. Use AAD for metadata that must not be modified but does not need confidentiality (e.g., the database row ID, the encryption algorithm identifier, the key version).
- **Key rotation**: Encrypted data must be decryptable after key rotation. Common pattern: encrypt with the current key, store the key version/ID alongside the ciphertext, decrypt by looking up the key version. Never delete old keys until all data encrypted under them has been re-encrypted.

**Anti-Patterns:**

1. **ECB mode for anything.** ECB encrypts each block independently -- identical plaintext blocks produce identical ciphertext blocks. The famous "ECB penguin" demonstrates this: encrypting a bitmap image in ECB mode preserves the visual pattern. ECB must never be used.
2. **Nonce reuse with GCM/CTR.** Reusing a nonce under the same key with GCM or CTR modes is a complete break of confidentiality and (for GCM) authenticity. Use random nonces from a CSPRNG, or switch to AES-GCM-SIV for nonce-misuse resistance.
3. **Using encryption without authentication.** AES-CBC or AES-CTR without a MAC. An attacker can flip bits in the ciphertext and the decryption will produce modified plaintext without any error. Always use AEAD (GCM, ChaCha20-Poly1305) or encrypt-then-MAC.
4. **Hardcoded encryption keys.** Embedding keys in source code, configuration files committed to version control, or Docker images. Keys must be stored in a secrets manager (Vault, AWS KMS, GCP KMS) and injected at runtime.
5. **Custom encryption schemes.** Inventing cipher combinations, custom padding, or "encryption" via XOR with a static key. Use well-vetted library implementations of standard algorithms. Cryptography is the only engineering discipline where being clever makes things worse.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-symmetric-encryption knowledge skill`

---

### Task 5: security-asymmetric-encryption

**Depends on:** none
**Files:** `agents/skills/claude-code/security-asymmetric-encryption/SKILL.md`, `agents/skills/claude-code/security-asymmetric-encryption/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-asymmetric-encryption
version: '1.0.0'
description: RSA, elliptic curve cryptography (ECDSA, Ed25519, X25519), key exchange (ECDHE), and when to use asymmetric vs symmetric encryption
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-symmetric-encryption
  - security-hashing-fundamentals
  - security-hmac-signatures
  - security-tls-fundamentals
  - security-certificate-management
  - owasp-cryptography
stack_signals: []
keywords:
  - RSA
  - elliptic curve
  - ECDSA
  - Ed25519
  - X25519
  - ECDHE
  - key exchange
  - public key
  - private key
  - asymmetric encryption
  - digital signature
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Asymmetric Encryption`
**Tagline:** `> Public-key cryptography for key exchange, digital signatures, and identity verification -- Ed25519 for signatures, X25519 for key exchange, RSA-2048+ only for legacy compatibility`

**When to Use:**

- Designing a system where parties need to communicate securely without a pre-shared secret
- Implementing digital signatures for code signing, document signing, or API request authentication
- Choosing key types for TLS certificates, SSH keys, or JWT signing
- Evaluating RSA vs elliptic curve algorithms for a new system
- Implementing a key exchange protocol for end-to-end encryption

**Threat Context:**
Asymmetric encryption defends against man-in-the-middle attacks during key exchange, impersonation (via digital signatures that prove identity), and the key distribution problem (how to share secrets when there is no secure channel). RSA with keys shorter than 2048 bits is factorable with modern resources. NIST deprecated 1024-bit RSA in 2013. The looming threat of quantum computing (Shor's algorithm) will eventually break both RSA and elliptic curve cryptography, driving the transition to post-quantum algorithms (ML-KEM, ML-DSA), but current ECC and RSA-3072+ remain secure against classical attacks.

**Instructions:**

1. **For digital signatures, default to Ed25519.** Ed25519 (Edwards-curve Digital Signature Algorithm over Curve25519) provides 128-bit security, fast signing and verification, short signatures (64 bytes), and deterministic signature generation (no random nonce needed, eliminating a class of implementation bugs). Ed25519 is supported by OpenSSH, TLS 1.3, JWT (EdDSA), and all modern crypto libraries.
2. **For key exchange, default to X25519 (ECDHE).** X25519 performs Elliptic Curve Diffie-Hellman key exchange over Curve25519. It produces a shared secret from two parties' public keys without transmitting the secret. X25519 is the key exchange mechanism in TLS 1.3, Signal Protocol, and WireGuard. Always use ephemeral keys (ECDHE) for forward secrecy -- if a long-term key is later compromised, past sessions remain secure.
3. **Use RSA only for legacy compatibility.** RSA-2048 minimum, RSA-3072 recommended for new deployments requiring RSA. RSA keys are significantly larger than EC keys for equivalent security (3072-bit RSA ~ 256-bit EC ~ 128-bit security). RSA signing and decryption are slow compared to EC operations. RSA encryption uses OAEP padding (PKCS#1 v2.x) -- never use PKCS#1 v1.5 padding for encryption (Bleichenbacher's attack, 1998).
4. **Never encrypt large data with asymmetric encryption directly.** Asymmetric encryption is orders of magnitude slower than symmetric and has message size limits. Use hybrid encryption: generate a random symmetric key (AES-256), encrypt the data with the symmetric key, encrypt the symmetric key with the recipient's public key. TLS does exactly this.
5. **Protect private keys absolutely.** Private keys must never be logged, transmitted, or stored in plaintext. Store in HSMs (Hardware Security Modules) for highest security, or encrypted at rest with a passphrase. Rotate keys on any suspicion of compromise. Use separate key pairs for signing vs encryption.
6. **Understand the security level mapping:** RSA-2048 ~ 112-bit security. RSA-3072 ~ 128-bit security. P-256 (secp256r1) ~ 128-bit security. P-384 ~ 192-bit security. Curve25519 ~ 128-bit security. For new systems targeting 128-bit security, Curve25519 is optimal.

**Details:**

- **RSA internals (conceptual)**: RSA security relies on the difficulty of factoring the product of two large primes. Key generation: choose primes p and q, compute n = p\*q, compute e (public exponent, typically 65537), compute d (private exponent, modular inverse of e mod (p-1)(q-1)). Public key = (n, e). Private key = (n, d). Encryption: c = m^e mod n. Decryption: m = c^d mod n. The factoring problem makes deriving d from (n, e) computationally infeasible for sufficiently large n.
- **Elliptic curve internals (conceptual)**: ECC security relies on the difficulty of the Elliptic Curve Discrete Logarithm Problem (ECDLP). Given a point P on the curve and Q = kP (scalar multiplication), finding k from P and Q is computationally infeasible. Key generation: choose random k (private key), compute Q = kP (public key). Signatures (ECDSA/EdDSA) and key exchange (ECDH) derive from this one-way function.
- **Forward secrecy with ephemeral keys**: In TLS 1.3, both parties generate ephemeral X25519 key pairs per session. The shared secret is computed, used to derive session keys, and the ephemeral private keys are discarded. If the server's long-term private key is later compromised, past session keys cannot be recovered because the ephemeral keys no longer exist. This is forward secrecy, and it requires ephemeral key exchange (ECDHE or DHE).
- **Post-quantum considerations**: Shor's algorithm on a sufficiently large quantum computer breaks both RSA and ECC. NIST has standardized ML-KEM (Kyber) for key encapsulation and ML-DSA (Dilithium) for signatures. Hybrid approaches (X25519 + ML-KEM) are being deployed in TLS to provide quantum resistance without abandoning classical security. Plan migration paths now; do not wait for "quantum day."

**Anti-Patterns:**

1. **RSA-1024 or shorter keys.** Factored by academic research in 2010. RSA-768 was factored in 2009. Minimum is RSA-2048; prefer RSA-3072 or switch to ECC.
2. **PKCS#1 v1.5 padding for RSA encryption.** Bleichenbacher's adaptive chosen-ciphertext attack (1998) breaks this padding scheme. Use OAEP (PKCS#1 v2.x) for encryption. For signatures, PSS padding is preferred over PKCS#1 v1.5 but the signature padding vulnerability is less severe.
3. **Static Diffie-Hellman (no ephemeral keys).** Using the same DH key pair for all sessions means a compromised private key decrypts all past and future traffic. Always use ephemeral key exchange (ECDHE) for forward secrecy.
4. **Encrypting large payloads directly with RSA.** RSA can only encrypt data smaller than the key size minus padding overhead (~245 bytes for RSA-2048 with OAEP). Attempting to encrypt a file with RSA directly either fails or requires chunking, which introduces complexity and potential vulnerabilities. Use hybrid encryption.
5. **Trusting self-signed certificates in production.** A self-signed certificate proves that the server possesses the private key but provides no identity verification. Without a certificate authority chain, any attacker can generate their own self-signed certificate and intercept traffic.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-asymmetric-encryption knowledge skill`

---

### Task 6: security-hashing-fundamentals

**Depends on:** none
**Files:** `agents/skills/claude-code/security-hashing-fundamentals/SKILL.md`, `agents/skills/claude-code/security-hashing-fundamentals/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-hashing-fundamentals
version: '1.0.0'
description: Cryptographic hash functions (SHA-256, SHA-3, BLAKE3), collision resistance, preimage resistance, and correct use cases for hashing vs encryption vs MAC
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-hmac-signatures
  - security-credential-storage
  - security-symmetric-encryption
  - security-cryptographic-randomness
  - owasp-cryptography
stack_signals: []
keywords:
  - hash function
  - SHA-256
  - SHA-3
  - BLAKE3
  - collision resistance
  - preimage attack
  - content addressing
  - integrity verification
  - MD5
  - SHA-1
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Hashing Fundamentals`
**Tagline:** `> One-way functions for integrity verification, content addressing, and commitment schemes -- SHA-256 for interoperability, BLAKE3 for performance, and never MD5 or SHA-1 for security`

**When to Use:**

- Verifying file or data integrity (checksums, download verification)
- Content addressing (deduplication, cache keys, Git object IDs)
- Generating deterministic identifiers from variable-length input
- Choosing a hash function for a new system
- Reviewing code that uses hashing and assessing whether the right function and use pattern is applied
- Understanding why MD5 or SHA-1 must be replaced in security contexts

**Threat Context:**
Weak hash functions enable collision attacks (two different inputs producing the same hash), preimage attacks (finding an input that produces a target hash), and second preimage attacks (finding a different input with the same hash as a known input). MD5 collisions can be generated in seconds on commodity hardware (2004, Wang et al.). SHA-1 collisions were demonstrated practically by Google/CWI Amsterdam in 2017 (SHAttered attack). These attacks enable forged certificates, tampered software packages, and bypassed integrity checks.

**Instructions:**

1. **For general-purpose cryptographic hashing, use SHA-256.** SHA-256 (part of the SHA-2 family) provides 128-bit collision resistance and 256-bit preimage resistance. It is universally supported, NIST-approved, and the standard choice for integrity verification, digital signatures, and certificate fingerprints.
2. **For performance-sensitive hashing, use BLAKE3.** BLAKE3 is 6-14x faster than SHA-256 on modern CPUs (exploits SIMD parallelism). It is based on the BLAKE2/ChaCha cipher family and provides 128-bit security. Use BLAKE3 for content addressing, file deduplication, and any use case where hash throughput matters. BLAKE3 is not yet NIST-standardized, so use SHA-256 when FIPS compliance is required.
3. **For post-quantum margin, consider SHA-3 (Keccak).** SHA-3 uses a completely different construction (sponge) from SHA-2 (Merkle-Damgard). If SHA-2 is ever broken due to a structural attack on Merkle-Damgard, SHA-3 is unaffected. In practice, SHA-256 is not under threat, but security-critical systems may use SHA-3-256 for defense in depth.
4. **Never use MD5 or SHA-1 for security purposes.** MD5: collision attacks are trivial (seconds on a laptop). SHA-1: collision attacks demonstrated (SHAttered, 2017). Both are acceptable only for non-security checksums (e.g., checking file transfer completeness where adversarial tampering is not a concern).
5. **Understand the three security properties:**
   - **Preimage resistance:** Given hash H, infeasible to find any input m such that hash(m) = H.
   - **Second preimage resistance:** Given input m1, infeasible to find a different m2 such that hash(m1) = hash(m2).
   - **Collision resistance:** Infeasible to find any two distinct inputs m1, m2 such that hash(m1) = hash(m2). Collision resistance implies second preimage resistance.
6. **Hashing is NOT encryption.** Hashing is irreversible (one-way). Encryption is reversible (two-way). Never hash data you need to recover. Never encrypt data you only need to verify. Hashing is for integrity and commitment; encryption is for confidentiality.
7. **Hashing is NOT a MAC.** A bare hash (SHA-256(message)) does not authenticate the sender. Anyone can compute SHA-256 of any message. Use HMAC (keyed hash) when you need to verify both integrity and authenticity. See `security-hmac-signatures`.

**Details:**

- **Length extension attacks**: SHA-256 (and all Merkle-Damgard hashes) are vulnerable to length extension: given hash(m) and len(m), an attacker can compute hash(m || padding || suffix) without knowing m. This breaks naive "hash(secret || message)" authentication schemes. Mitigations: use HMAC (which nests the hash), use SHA-3 (sponge construction is immune), or use BLAKE3 (also immune).
- **Birthday paradox and collision probability**: Due to the birthday paradox, a hash with n-bit output requires only ~2^(n/2) operations to find a collision. SHA-256 (256-bit output) requires ~2^128 operations for a collision -- secure. MD5 (128-bit output) requires ~2^64 operations -- within reach of modern computing.
- **Content addressing pattern**: Hash the content to derive its address/key. Git uses SHA-1 (migrating to SHA-256) for object IDs. IPFS uses multihash (hash function identifier + digest). Docker uses SHA-256 for layer and image digests. The pattern: store(hash(content), content), retrieve(hash) -> content. Integrity is self-verifying -- if the content does not hash to the key, it has been tampered with.
- **Hash function selection decision tree**: Need FIPS compliance? -> SHA-256 or SHA-3. Need maximum throughput? -> BLAKE3. Need defense-in-depth against Merkle-Damgard structural attacks? -> SHA-3. Non-security checksum? -> CRC32 or xxHash (not cryptographic, but fast). Password storage? -> Not a general hash -- use Argon2id (see `security-credential-storage`).

**Anti-Patterns:**

1. **MD5 for integrity in adversarial contexts.** MD5 collisions can be generated for chosen-prefix attacks, enabling certificate forgery (Flame malware, 2012). MD5 is only acceptable for non-security checksums.
2. **SHA-256(password) for credential storage.** General-purpose hash functions are too fast for password storage. An attacker with a GPU can compute billions of SHA-256 hashes per second. Use purpose-built password hashing functions (Argon2id, bcrypt, scrypt) that are deliberately slow. See `security-credential-storage`.
3. **hash(secret || message) for authentication.** Vulnerable to length extension attacks on Merkle-Damgard hashes (SHA-256, SHA-512). Use HMAC(key, message) instead -- HMAC is provably secure against length extension.
4. **Truncating hashes for space savings without understanding the security impact.** Truncating SHA-256 output from 256 bits to 128 bits halves the collision resistance (from 2^128 to 2^64). If you must truncate, ensure the reduced collision resistance is acceptable for your threat model.
5. **Assuming hash uniqueness.** Hashes are not unique -- collisions exist by the pigeonhole principle. Design systems to handle collisions gracefully (e.g., content-addressed storage should verify content matches on retrieval, not just the hash).

6. Run: `harness validate`
7. Commit: `feat(skills): add security-hashing-fundamentals knowledge skill`

---

### Task 7: security-credential-storage

**Depends on:** none
**Files:** `agents/skills/claude-code/security-credential-storage/SKILL.md`, `agents/skills/claude-code/security-credential-storage/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-credential-storage
version: '1.0.0'
description: Password hashing with Argon2id, bcrypt, and scrypt -- salting, peppering, adaptive cost, and upgrade strategies for legacy hashes
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-hashing-fundamentals
  - security-authentication-flows
  - security-session-management
  - security-mfa-design
  - owasp-auth-patterns
  - owasp-secrets-management
stack_signals: []
keywords:
  - password hashing
  - argon2
  - bcrypt
  - scrypt
  - salting
  - peppering
  - credential storage
  - password storage
  - adaptive cost
  - key stretching
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Credential Storage`
**Tagline:** `> Argon2id for new systems, bcrypt for broad compatibility -- always salt, consider peppering, tune cost parameters to hardware, and plan hash upgrade paths`

**When to Use:**

- Designing a user registration and login system that stores passwords
- Reviewing existing password storage for security adequacy
- Migrating from an insecure hashing scheme (MD5, SHA-1, unsalted SHA-256) to a secure one
- Choosing between Argon2id, bcrypt, and scrypt for a new project
- Tuning password hashing cost parameters for production hardware
- Implementing a "hash upgrade on login" strategy for legacy systems

**Threat Context:**
When a database is breached (and breaches are a matter of when, not if), the attacker obtains the stored password representations. If passwords are stored in plaintext, all accounts are immediately compromised. If stored as fast hashes (MD5, SHA-256), offline brute-force attacks using GPUs can crack the majority of passwords in hours (LinkedIn breach 2012: 6.5M SHA-1 unsalted hashes cracked within days). Purpose-built password hashing functions defend by making each guess computationally expensive, turning a hours-long attack into one requiring years.

**Instructions:**

1. **Default to Argon2id.** Argon2id (winner of the 2015 Password Hashing Competition) is memory-hard and resistant to both GPU and ASIC attacks. It has three tunable parameters: memory cost (minimum 64 MB recommended), time cost (iterations, minimum 3), and parallelism (threads, typically 1-4). Argon2id combines Argon2i (data-independent, resistant to side-channel attacks) and Argon2d (data-dependent, maximally resistant to GPU attacks) in a hybrid mode.
2. **Use bcrypt when Argon2id is unavailable.** bcrypt has been battle-tested since 1999, is available in virtually every language, and has a maximum cost factor of 31 (exponential). Set the work factor so that hashing takes 250-500ms on your production hardware. bcrypt has a 72-byte input limit -- passwords longer than 72 bytes are silently truncated. Pre-hash long passwords with SHA-256 if supporting long passphrases: bcrypt(SHA-256(password)).
3. **Always use a unique salt per credential.** A salt is a random value (16+ bytes) stored alongside the hash. Salting ensures that identical passwords produce different hashes, defeating precomputed rainbow tables and preventing attackers from cracking all instances of a common password at once. Argon2id and bcrypt generate and embed salts automatically -- do not manage salts manually.
4. **Consider peppering.** A pepper is a secret value (32+ bytes) applied to the password before hashing: hash(pepper + password, salt). Unlike the salt (stored with the hash), the pepper is stored separately (HSM, environment variable, secrets manager). If the database is breached but the pepper is not, the hashes are uncrackable even with infinite compute. Pepper rotation requires re-hashing all credentials on login.
5. **Tune cost parameters to target 250-500ms per hash.** Benchmark on production hardware. Too fast = vulnerable to brute force. Too slow = degraded login UX and potential for login-based DoS. For Argon2id: start with 64 MB memory, 3 iterations, 1 parallelism, and increase memory until you hit the target latency. For bcrypt: start at cost 10 and increment.
6. **Implement hash upgrade on login.** When a user logs in successfully (proving they know the password), check the stored hash format. If it uses a legacy algorithm, re-hash the password with the current algorithm and update the stored hash. This allows transparent migration from MD5 -> bcrypt -> Argon2id without forcing password resets.
7. **Never implement password storage yourself.** Use the language's standard library or a well-maintained security library. Custom password hashing implementations invariably contain timing side channels, incorrect salt generation, or parameter misconfiguration.

**Details:**

- **Why general-purpose hashes fail**: SHA-256 computes at ~6 billion hashes/second on a modern GPU (RTX 4090). At that rate, all 6-character alphanumeric passwords (2.2 billion combinations) are cracked in under 1 second. 8-character passwords (218 trillion combinations) fall in ~10 hours. bcrypt at cost 12 computes at ~50 hashes/second on the same GPU -- the same 8-character space takes ~138,000 years.
- **Argon2 variants**: Argon2d is optimized for resistance against GPU/ASIC attacks (data-dependent memory access). Argon2i is optimized for resistance against side-channel attacks (data-independent memory access). Argon2id is the hybrid: first pass uses Argon2i (side-channel resistance), subsequent passes use Argon2d (GPU resistance). Always use Argon2id.
- **The bcrypt 72-byte limit**: bcrypt truncates input at 72 bytes. For systems accepting long passphrases or Unicode passwords (which may be many bytes), pre-hash with SHA-256: bcrypt(base64(SHA-256(password))). This is safe because SHA-256 is preimage resistant -- the pre-hash does not weaken the password.
- **Credential stuffing defense**: Even perfect password hashing does not prevent credential stuffing (trying leaked username/password pairs from other breaches). Defense: rate limiting, account lockout, MFA, and monitoring for bulk login failures. Password hashing protects the stored credentials; MFA protects the authentication flow.

**Anti-Patterns:**

1. **Plaintext password storage.** Any breach exposes all credentials instantly. No exceptions, no excuses.
2. **Unsalted hashing (MD5(password), SHA-256(password)).** Rainbow tables provide instant lookup for common passwords. Even uncommon passwords fall to GPU-accelerated brute force within hours.
3. **Global salt (same salt for all users).** Defeats the purpose of salting -- attackers can still attack all hashes simultaneously by incorporating the single salt into their GPU kernel. Each credential must have a unique random salt.
4. **Static cost parameters that are never re-tuned.** bcrypt cost 10 was appropriate in 2010. Hardware improves roughly 2x every 18 months. Re-tune cost parameters annually. Use hash-upgrade-on-login to apply increased costs transparently.
5. **Encrypting passwords instead of hashing them.** Encryption is reversible -- whoever holds the key can recover all passwords. If the key is compromised alongside the database, all passwords are exposed. Passwords must be hashed (one-way), never encrypted (two-way).

6. Run: `harness validate`
7. Commit: `feat(skills): add security-credential-storage knowledge skill`

---

### Task 8: security-session-management

**Depends on:** none
**Files:** `agents/skills/claude-code/security-session-management/SKILL.md`, `agents/skills/claude-code/security-session-management/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-session-management
version: '1.0.0'
description: Session lifecycle design -- token generation, fixation prevention, binding, idle and absolute timeouts, revocation, and secure cookie configuration
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-credential-storage
  - security-authentication-flows
  - security-cryptographic-randomness
  - security-tls-fundamentals
  - owasp-auth-patterns
  - owasp-csrf-protection
  - owasp-security-headers
stack_signals: []
keywords:
  - session management
  - session token
  - session fixation
  - session hijacking
  - cookie security
  - token revocation
  - idle timeout
  - absolute timeout
  - JWT session
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Session Management`
**Tagline:** `> Session tokens are bearer credentials -- generate with CSPRNG, bind to client context, enforce idle and absolute timeouts, and regenerate on privilege changes`

**When to Use:**

- Designing the authentication and session layer of a web application
- Choosing between server-side sessions and JWTs (stateless tokens)
- Reviewing session cookie configuration for security gaps
- Implementing session timeout and revocation policies
- Investigating session hijacking or session fixation vulnerabilities
- Adding "remember me" functionality or concurrent session controls

**Threat Context:**
Session hijacking (stealing a valid session token) gives an attacker full access to the victim's account without knowing the password. Attack vectors include: network sniffing (mitigated by TLS and Secure cookies), cross-site scripting (mitigated by HttpOnly cookies), session fixation (attacker sets the session ID before authentication), and client-side token theft (malware, shared computers). The 2023 Okta support breach exploited stolen session tokens (HAR files containing cookies) to access customer admin accounts.

**Instructions:**

1. **Generate session tokens with a CSPRNG.** Minimum 128 bits of entropy (32 hex characters or 22 base64 characters). Use the platform's cryptographic random generator (crypto.randomBytes in Node.js, os.urandom in Python, SecureRandom in Java). Never use Math.random(), sequential IDs, timestamps, or predictable values.
2. **Configure cookies correctly (for cookie-based sessions):**
   - `Secure`: Only transmit over HTTPS. Prevents network sniffing.
   - `HttpOnly`: Inaccessible to JavaScript. Prevents XSS token theft.
   - `SameSite=Lax` (minimum) or `SameSite=Strict`: Prevents CSRF by restricting cross-origin cookie transmission. Use `Strict` for high-security applications; `Lax` for applications that need top-level navigation from external links.
   - `Path=/`: Scope appropriately. Avoid overly broad or overly narrow paths.
   - `Domain`: Set explicitly. Omit to restrict to the exact origin (most restrictive).
   - Short `Max-Age` or `Expires`: Align with your absolute timeout policy.
3. **Regenerate the session ID on authentication state changes.** After successful login, privilege escalation (e.g., entering admin mode), or password change, issue a new session token and invalidate the old one. This prevents session fixation attacks where an attacker pre-sets the session ID.
4. **Enforce dual timeouts:**
   - **Idle timeout** (15-30 minutes for sensitive applications, 2-8 hours for low-risk): If the user is inactive for this duration, invalidate the session. Measure server-side by tracking last-activity timestamp.
   - **Absolute timeout** (8-24 hours): Maximum session lifetime regardless of activity. Forces re-authentication periodically. Critical for compromised token defense.
5. **Implement server-side revocation.** Maintain a server-side session store (database, Redis) that allows immediate invalidation. When a user logs out, changes their password, or is administratively suspended, delete/invalidate the session. This is a fundamental limitation of stateless JWTs -- they cannot be revoked before expiry without a server-side blocklist.
6. **Bind sessions to client context.** Record the client's IP address, User-Agent, and (for high-security applications) TLS client certificate fingerprint at session creation. If these change mid-session, require re-authentication. This limits token theft -- a stolen token used from a different IP/browser triggers re-auth.
7. **JWT-specific guidance (if using JWTs for sessions):** Keep expiry short (5-15 minutes). Use a refresh token (stored in HttpOnly cookie) to obtain new access tokens. Store the refresh token server-side for revocability. Never store JWTs in localStorage (XSS-accessible). Sign with RS256 or EdDSA (asymmetric) to allow verification without sharing the signing key.

**Details:**

- **Server-side sessions vs JWTs**: Server-side sessions store state on the server (session ID is an opaque reference). JWTs store state in the token (self-contained claims). Server-side sessions are inherently revocable. JWTs are not revocable without a server-side blocklist (which negates the "stateless" benefit). For most web applications, server-side sessions with Redis are simpler and more secure. JWTs are appropriate for short-lived access tokens in microservice architectures where the API gateway validates the token and the downstream services trust the gateway.
- **The "remember me" pattern**: A persistent login token (30-90 day expiry) stored in a separate HttpOnly Secure cookie. The persistent token is a random value stored hashed in the database (never in plaintext). When the session expires but the persistent token is valid, create a new session but restrict it to non-sensitive operations (reading, browsing). Require re-authentication for sensitive actions (changing password, making payments). Invalidate the persistent token after use and issue a new one (rotating token pattern).
- **Concurrent session controls**: Decide whether a user can have multiple simultaneous sessions (different devices). Options: allow unlimited sessions (common), limit to N sessions (revoke the oldest), or allow only one session (revoke all others on login). Enterprise applications typically allow N sessions with visibility (show the user their active sessions and allow selective revocation).

**Anti-Patterns:**

1. **Session tokens in URLs.** Query parameters appear in browser history, server logs, Referer headers, and proxy logs. Session tokens must be in cookies (preferred) or Authorization headers (for APIs).
2. **Not regenerating session ID after login.** Enables session fixation: attacker sends victim a link with a pre-set session ID, victim logs in, attacker now has an authenticated session.
3. **JWT in localStorage.** Accessible to any JavaScript on the page. A single XSS vulnerability exposes all user sessions. Use HttpOnly cookies for token storage.
4. **No idle timeout.** A session that lives forever on an unattended browser is a liability. Kiosk computers, shared workstations, and stolen laptops all provide persistent access without timeouts.
5. **Logout that only deletes the client cookie.** The server-side session must also be invalidated. If the server session persists, an attacker with the old cookie can continue using the session after the user "logs out."

6. Run: `harness validate`
7. Commit: `feat(skills): add security-session-management knowledge skill`

---

### Task 9: security-rbac-design

**Depends on:** none
**Files:** `agents/skills/claude-code/security-rbac-design/SKILL.md`, `agents/skills/claude-code/security-rbac-design/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-rbac-design
version: '1.0.0'
description: Role-based access control modeling -- role hierarchies, permission granularity, role explosion prevention, and the principle of least privilege
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-abac-design
  - security-rebac-design
  - security-capability-based-security
  - security-zero-trust-principles
  - owasp-auth-patterns
  - owasp-idor-prevention
stack_signals: []
keywords:
  - RBAC
  - role-based access control
  - roles
  - permissions
  - authorization
  - least privilege
  - role hierarchy
  - role explosion
  - access control matrix
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# RBAC Design`
**Tagline:** `> Assign permissions to roles, assign roles to users -- simple, auditable, and sufficient for most applications when combined with resource-level checks`

**When to Use:**

- Designing an authorization system for a new application
- Evaluating whether RBAC is the right model (vs ABAC or ReBAC) for your use case
- Refactoring an ad-hoc permission system into a structured model
- Adding multi-tenancy authorization to an existing application
- Auditing role assignments for principle of least privilege compliance
- Preventing role explosion as the application grows

**Threat Context:**
Authorization failures are the #1 vulnerability category in the OWASP Top 10 (A01:2021 Broken Access Control). Common exploits: horizontal privilege escalation (accessing another user's data by changing an ID parameter -- IDOR), vertical privilege escalation (accessing admin functions as a regular user), and missing function-level access control (API endpoints that lack permission checks entirely). A well-designed RBAC system with enforced resource-level checks eliminates these attack classes.

**Instructions:**

1. **Start with the permission model.** Identify the resources (users, orders, projects, documents) and operations (create, read, update, delete, approve, publish). Define permissions as resource:operation pairs: `orders:read`, `orders:create`, `orders:approve`, `users:manage`. Be granular enough to enforce least privilege but not so granular that the model becomes unmanageable.
2. **Define roles as named collections of permissions.** Common starter roles: `viewer` (read-only), `editor` (read + write), `admin` (full access), `owner` (admin + billing/settings). Each role is a set of permissions. Users are assigned one or more roles. Permission checks evaluate: "Does the user's role set include the required permission?"
3. **Apply the principle of least privilege.** Every user, service account, and API key should have the minimum permissions required for their function. Default to no access; grant explicitly. Review role assignments quarterly.
4. **Implement role hierarchies carefully.** Role inheritance (admin inherits all editor permissions, editor inherits all viewer permissions) reduces duplication but creates implicit permissions that are hard to audit. If using hierarchies, document the inheritance chain explicitly and provide tooling to "expand" a role to show its complete permission set.
5. **Add resource-level checks (object-level authorization).** RBAC roles alone are not sufficient. A user with `orders:read` permission must only be able to read their own orders (or their organization's orders), not all orders in the system. Implement resource ownership checks: `user.hasPermission('orders:read') AND order.belongsTo(user.organization)`. This prevents IDOR.
6. **Enforce authorization at the API layer, not the UI layer.** Hiding a button in the UI is not authorization. Every API endpoint must independently verify that the authenticated user has the required permission for the requested resource. UI visibility should mirror permissions but must not be the only enforcement mechanism.
7. **Multi-tenancy: scope roles to tenants.** In SaaS applications, a user may be an `admin` in Organization A but a `viewer` in Organization B. Model this with role assignments scoped to a tenant: `(user, role, tenant)` triples. Permission checks include the tenant context: `user.hasRole('admin', currentOrganization)`.

**Details:**

- **RBAC variants**: RBAC0 (flat roles, no hierarchy), RBAC1 (role hierarchy with inheritance), RBAC2 (constraints such as separation of duty -- a user cannot hold both "requester" and "approver" roles), RBAC3 (RBAC1 + RBAC2). Most applications need RBAC1 with some RBAC2 constraints for sensitive operations.
- **Role explosion problem**: As features grow, teams create new roles for every combination of permissions: `marketing-editor`, `marketing-viewer`, `sales-editor`, `sales-viewer`, `marketing-sales-editor`. This combinatorial explosion makes the role model unmanageable. Solutions: (1) Use permission groups instead of proliferating roles -- a user gets a base role plus individual permission grants. (2) Switch to ABAC for fine-grained decisions that do not map well to roles. (3) Use role templates that are scoped to a resource context (e.g., `editor` role scoped to the "marketing" module).
- **Separation of duty**: Critical operations should require two distinct roles. Example: the person who creates a payment (role: `payment-creator`) cannot approve the same payment (role: `payment-approver`). Implement as a constraint: if user holds `payment-creator`, they cannot also hold `payment-approver` for the same scope.
- **RBAC vs ABAC decision**: RBAC is sufficient when: authorization decisions depend primarily on "who is the user?" and "what is their role?" ABAC is needed when: authorization depends on attributes of the resource (classification, owner, creation date), the user (department, clearance, location), or the environment (time of day, IP address, device). If you find yourself creating roles that encode attribute combinations (e.g., `us-east-daytime-admin`), switch to ABAC.

**Anti-Patterns:**

1. **"God role" with all permissions.** A single `super-admin` role that bypasses all checks. If this role is compromised, the attacker has unlimited access. Instead, require explicit permissions even for the highest-privilege role, and log all actions performed under admin roles.
2. **Permission checks only in the UI.** Hiding buttons and menu items without server-side enforcement. Attackers use API clients directly and bypass all UI-level controls.
3. **Hardcoded role names in business logic.** `if (user.role === 'admin')` scattered throughout the codebase. This makes role changes and additions extremely fragile. Check permissions, not role names: `if (user.hasPermission('orders:approve'))`.
4. **No resource-level check (IDOR vulnerability).** Verifying `user.hasRole('editor')` but not verifying that the user has access to the specific resource being edited. This allows horizontal privilege escalation -- editing another user's resources with a valid role.
5. **Roles that only grow, never shrink.** Over time, roles accumulate permissions as features are added but permissions are never removed. Audit roles quarterly. If a permission was added for a one-time project, remove it when the project ends.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-rbac-design knowledge skill`

---

### Task 10: security-zero-trust-principles

**Depends on:** none
**Files:** `agents/skills/claude-code/security-zero-trust-principles/SKILL.md`, `agents/skills/claude-code/security-zero-trust-principles/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-zero-trust-principles
version: '1.0.0'
description: Zero trust architecture principles -- never trust, always verify, least privilege, assume breach, and continuous verification regardless of network position
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-trust-boundaries
  - security-microsegmentation
  - security-identity-verification
  - security-rbac-design
  - security-tls-fundamentals
  - security-mtls-design
  - owasp-auth-patterns
stack_signals: []
keywords:
  - zero trust
  - never trust always verify
  - least privilege
  - assume breach
  - continuous verification
  - BeyondCorp
  - network segmentation
  - identity-based security
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Zero Trust Principles`
**Tagline:** `> No implicit trust based on network position, VPN status, or previous authentication -- every request is authenticated, authorized, and encrypted regardless of origin`

**When to Use:**

- Designing a new system architecture and need to establish the security model
- Migrating from a perimeter-based security model to a modern architecture
- Planning service-to-service authentication in a microservices environment
- Evaluating whether internal APIs need authentication and encryption
- Responding to a breach and hardening the architecture against lateral movement
- Implementing security for remote/hybrid workforce access

**Threat Context:**
Perimeter-based security ("hard shell, soft interior") fails because attackers who breach the perimeter have unrestricted access to internal resources. The 2020 SolarWinds attack demonstrated this at scale: once the supply chain was compromised, attackers moved laterally through "trusted" internal networks of government agencies and Fortune 500 companies for months undetected. The 2023 Microsoft Storm-0558 breach similarly exploited implicit trust in internal token-signing infrastructure. Zero trust assumes the network is always hostile and every component may already be compromised.

**Instructions:**

1. **Never trust, always verify.** Every request to every resource must be authenticated and authorized, regardless of network location. An API call from inside the corporate network receives the same scrutiny as one from the public internet. There is no "trusted zone" -- only verified and unverified requests.
2. **Apply least privilege everywhere.** Users, services, and infrastructure components receive the minimum permissions required for their current task. Permissions are scoped to specific resources and time-limited where possible. A CI/CD pipeline token that needs to deploy to staging should not have production credentials.
3. **Assume breach.** Design every component as if adjacent components may already be compromised. This drives: mutual authentication between services (mTLS), encrypted communication even on internal networks, and segmentation that limits blast radius. If Service A is compromised, it should not be able to access Service B's data without separately authenticating.
4. **Verify explicitly.** Authentication is not a one-time event. Continuously evaluate: Is the user's session still valid? Has the device's security posture changed? Has the user's risk profile changed (impossible travel, unusual access patterns)? Re-authenticate when risk indicators change.
5. **Use identity as the new perimeter.** Replace network-based access controls (VPN, firewall rules) with identity-based controls. Access decisions use: user identity, device identity and health, application identity, data classification, and real-time risk signals. Google's BeyondCorp model is the canonical implementation: employees access internal applications through an identity-aware proxy with no VPN required.
6. **Encrypt all communications.** TLS for all HTTP traffic (including internal). mTLS for service-to-service communication. Encryption at rest for all stored data. Even "internal" networks may be observed by compromised hosts, compromised switches, or cloud provider infrastructure.
7. **Log and monitor everything.** Zero trust generates audit evidence at every access decision. Centralize logs, apply anomaly detection, and alert on policy violations. If you cannot verify a claim, you cannot enforce zero trust.

**Details:**

- **BeyondCorp model (Google)**: Google's internal zero trust implementation, operational since 2014. Key components: (1) Device inventory database (every device has a certificate-based identity), (2) User identity database (SSO with MFA), (3) Access proxy (all requests route through an identity-aware proxy that enforces per-request authorization), (4) Trust tiers (devices and users are classified into trust levels based on posture, role, and behavior), (5) No VPN -- access decisions are made per-request based on identity and context, not network position.
- **NIST SP 800-207 Zero Trust Architecture**: The reference standard. Defines core tenets: all data sources and computing services are resources; all communication is secured regardless of network location; access to resources is granted per-session; access is determined by dynamic policy (user identity, application, device state, behavioral attributes); all owned assets are monitored; authentication and authorization are strictly enforced before access.
- **Practical implementation layers**: Layer 1 (quick wins): enforce TLS everywhere, add authentication to all internal APIs, implement service-to-service mTLS. Layer 2 (identity-centric): deploy identity-aware proxy, implement device trust verification, add continuous authentication. Layer 3 (advanced): real-time risk scoring, dynamic policy engine, microsegmentation at the application level.
- **Zero trust and microservices**: In a Kubernetes environment, zero trust means: every pod has a service identity (SPIFFE/SPIRE), service mesh enforces mTLS between pods (Istio, Linkerd), network policies restrict pod-to-pod communication to explicit allow lists, and API gateways enforce user-level authorization on every request. The service mesh becomes the policy enforcement point.

**Anti-Patterns:**

1. **"We have a VPN, so internal traffic is safe."** A VPN moves the perimeter to the VPN server but does not secure internal communication. Any compromised host on the VPN has the same access as a legitimate one. VPN is a transport mechanism, not a security architecture.
2. **Zero trust in name only (adding mTLS but not authorization).** Encrypting and authenticating internal traffic is necessary but not sufficient. If Service A can call any endpoint on Service B with a valid mTLS certificate, lateral movement is still trivial. Per-endpoint authorization is required.
3. **One-time authentication treated as continuous trust.** Authenticating a user at login and trusting the session for 24 hours without re-evaluation. During those 24 hours, the device could be compromised, the user's credentials could be phished, or the user's role could change. Implement step-up authentication for sensitive operations and continuous posture evaluation.
4. **Treating zero trust as a product purchase.** Zero trust is an architecture model, not a product. No single vendor provides "zero trust in a box." It requires changes to identity management, network architecture, application design, and monitoring. Vendor products implement components of a zero trust architecture.
5. **All-or-nothing implementation.** Attempting to implement zero trust across the entire organization simultaneously. Start with the highest-value assets, implement zero trust for those, validate the approach, then expand. BeyondCorp was rolled out at Google incrementally over 6+ years.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-zero-trust-principles knowledge skill`

---

### Task 11: security-tls-fundamentals

**Depends on:** none
**Files:** `agents/skills/claude-code/security-tls-fundamentals/SKILL.md`, `agents/skills/claude-code/security-tls-fundamentals/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-tls-fundamentals
version: '1.0.0'
description: TLS 1.3 handshake, cipher suite selection, certificate chain validation, and why TLS 1.0/1.1 must be disabled
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-symmetric-encryption
  - security-asymmetric-encryption
  - security-certificate-management
  - security-hsts-preloading
  - security-mtls-design
  - owasp-security-headers
stack_signals: []
keywords:
  - TLS
  - TLS 1.3
  - TLS handshake
  - cipher suite
  - certificate chain
  - HTTPS
  - SSL
  - forward secrecy
  - certificate authority
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# TLS Fundamentals`
**Tagline:** `> TLS 1.3 with ECDHE key exchange, AES-256-GCM or ChaCha20-Poly1305 ciphers, and valid certificates -- the minimum bar for all network communication`

**When to Use:**

- Setting up HTTPS for a web application or API
- Configuring TLS cipher suites on a server or load balancer
- Diagnosing TLS handshake failures or certificate errors
- Evaluating whether to support TLS 1.2 alongside TLS 1.3
- Implementing certificate pinning or transparency monitoring
- Reviewing a system's transport security posture

**Threat Context:**
Without TLS, all network traffic is plaintext -- readable and modifiable by anyone on the network path (ISP, WiFi operator, compromised router, government surveillance). Man-in-the-middle (MITM) attacks can intercept credentials, session tokens, and sensitive data. Historical TLS vulnerabilities (POODLE against SSL 3.0/TLS 1.0 CBC, BEAST against TLS 1.0 CBC, CRIME/BREACH against TLS compression, Heartbleed in OpenSSL) demonstrate that protocol version and configuration matter enormously. TLS 1.3 eliminates all known protocol-level attacks present in TLS 1.0-1.2.

**Instructions:**

1. **Deploy TLS 1.3 as the primary protocol.** TLS 1.3 (RFC 8446, 2018) removes all insecure cryptographic options from the protocol: no RSA key exchange (no forward secrecy), no CBC mode (padding oracle risk), no static DH, no custom DH groups, no RC4, no 3DES, no MD5, no SHA-1 in signatures. The only key exchange is ephemeral Diffie-Hellman (ECDHE or DHE). The only ciphers are AEAD (AES-128-GCM, AES-256-GCM, ChaCha20-Poly1305). The handshake is 1 round trip (1-RTT) instead of 2 (TLS 1.2), improving latency.
2. **Support TLS 1.2 as fallback if required.** Some clients (older Android, enterprise proxies) do not support TLS 1.3. If TLS 1.2 must be supported, restrict cipher suites to: `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384`, `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`, `TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384`, `TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256`. All require ECDHE (forward secrecy) and AEAD ciphers.
3. **Disable TLS 1.0 and TLS 1.1.** Both are deprecated by IETF (RFC 8996, 2021). TLS 1.0 is vulnerable to BEAST and POODLE. TLS 1.1 has no known protocol attacks but uses obsolete cipher constructions. PCI DSS 3.2+ requires TLS 1.2 minimum for cardholder data.
4. **Use valid certificates from a trusted CA.** Obtain certificates from Let's Encrypt (free, automated via ACME), or a commercial CA for extended validation. Certificates must: match the domain name (Subject Alternative Name), not be expired, chain to a trusted root CA, and use RSA-2048+ or ECDSA P-256+ keys. Prefer ECDSA certificates -- smaller, faster handshakes.
5. **Enable HSTS (HTTP Strict Transport Security).** The `Strict-Transport-Security` header tells browsers to only connect via HTTPS, preventing SSL stripping attacks. Set `max-age=31536000; includeSubDomains; preload` for maximum protection. See `security-hsts-preloading` for preload list submission.
6. **Understand the TLS 1.3 handshake:** Client sends ClientHello (supported cipher suites, key shares for ECDHE). Server responds with ServerHello (selected cipher suite, key share), encrypted EncryptedExtensions, Certificate, CertificateVerify (proves possession of private key), and Finished. Client verifies certificate chain, computes shared secret from key exchange, sends its own Finished. Total: 1 round trip to first application data. With 0-RTT resumption, returning clients can send data on the first packet (at the cost of replay vulnerability for 0-RTT data).
7. **Monitor certificate transparency logs.** Certificate Transparency (CT) is a public log of all issued certificates. Monitor CT logs for your domains (crt.sh, Google's CT monitoring) to detect misissued or unauthorized certificates.

**Details:**

- **Cipher suite anatomy (TLS 1.3)**: TLS 1.3 cipher suite names are simpler: `TLS_AES_256_GCM_SHA384` specifies only the AEAD cipher and hash function. Key exchange is always ECDHE (negotiated separately via supported_groups extension). TLS 1.2 cipher suite names encode everything: `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` = ECDHE key exchange + RSA authentication + AES-256-GCM cipher + SHA-384 PRF.
- **Forward secrecy**: Ephemeral key exchange (ECDHE) generates a new key pair per session. The session key is derived from the ephemeral exchange. After the session ends, the ephemeral private key is discarded. If the server's long-term private key (the certificate key) is later compromised, past session keys cannot be recovered. Without forward secrecy (static RSA key exchange in TLS 1.2), a compromised certificate key decrypts all recorded past traffic.
- **0-RTT resumption risks**: TLS 1.3 supports 0-RTT data on resumed connections for reduced latency. However, 0-RTT data is replayable -- an attacker can capture and replay the first flight. Only use 0-RTT for idempotent requests (GET). Never use 0-RTT for state-changing operations (POST, PUT, DELETE). Most server implementations reject 0-RTT by default or limit it to specific endpoints.
- **Certificate chain validation**: The client verifies: (1) the leaf certificate matches the requested domain, (2) the certificate is within its validity period, (3) each certificate in the chain is signed by the next, (4) the chain terminates at a trusted root CA, (5) no certificate in the chain is revoked (via CRL or OCSP).

**Anti-Patterns:**

1. **Supporting SSL 3.0, TLS 1.0, or TLS 1.1.** Vulnerable to known protocol attacks. Disable completely.
2. **Non-AEAD cipher suites in TLS 1.2.** CBC-mode ciphers are vulnerable to padding oracle attacks. Only allow GCM or ChaCha20-Poly1305 ciphers.
3. **Self-signed certificates in production.** Provides encryption but no identity verification. Clients must disable certificate validation to connect, which enables trivial MITM.
4. **Ignoring certificate expiry.** Let's Encrypt certificates expire after 90 days. Automate renewal via ACME (certbot, Caddy). Certificate expiry outages are preventable and indicate operational maturity failure.
5. **TLS termination at the load balancer with plaintext internal traffic.** Terminates TLS at the edge and sends plaintext to backend servers. Any compromise of the internal network exposes all traffic. Re-encrypt between the load balancer and backends, or use end-to-end TLS.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-tls-fundamentals knowledge skill`

---

### Task 12: security-secrets-lifecycle

**Depends on:** none
**Files:** `agents/skills/claude-code/security-secrets-lifecycle/SKILL.md`, `agents/skills/claude-code/security-secrets-lifecycle/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-secrets-lifecycle
version: '1.0.0'
description: Secret rotation, distribution, revocation, and the principle that secrets must be ephemeral, auditable, and never embedded in code
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-vault-patterns
  - security-environment-variable-risks
  - security-credential-storage
  - security-symmetric-encryption
  - owasp-secrets-management
stack_signals: []
keywords:
  - secrets management
  - secret rotation
  - API keys
  - credentials
  - vault
  - KMS
  - secret distribution
  - revocation
  - ephemeral secrets
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Secrets Lifecycle`
**Tagline:** `> Secrets are born (generated), distributed (delivered to consumers), rotated (replaced on schedule), and die (revoked and destroyed) -- manage every phase or the secret manages you`

**When to Use:**

- Designing how an application retrieves database credentials, API keys, or encryption keys
- Establishing a secret rotation policy for a production system
- Responding to a secret exposure (leaked in logs, committed to Git, visible in error messages)
- Choosing between static secrets, dynamic secrets, and short-lived tokens
- Auditing an existing system for secret management gaps

**Threat Context:**
Exposed secrets are the most common initial access vector in cloud breaches. GitHub's 2023 secret scanning report found 12+ million secrets exposed in public repositories in a single year. The 2022 Uber breach began with hardcoded credentials in a PowerShell script. The 2023 CircleCI breach exposed customer secrets from the secrets management infrastructure itself. Secrets have a lifecycle -- generation, distribution, usage, rotation, and revocation -- and failure at any phase is a breach waiting to happen.

**Instructions:**

1. **Generate secrets with sufficient entropy.** API keys, tokens, and passwords: minimum 256 bits of randomness from a CSPRNG. Database passwords: 32+ random characters (letters, digits, symbols). Encryption keys: generate using the crypto library's key generation function, not by hashing a passphrase (unless using a proper KDF like Argon2id with appropriate parameters).
2. **Distribute secrets through a secrets manager, never through code or config files.** Use HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, or Kubernetes Secrets (with envelope encryption). Applications retrieve secrets at startup via authenticated API calls to the secrets manager. Secrets are never committed to version control, embedded in Docker images, or passed as build arguments.
3. **Use dynamic secrets when possible.** Instead of a static database password that lives forever, use Vault's database secrets engine to generate short-lived credentials (TTL: 1 hour) per application instance. When the TTL expires, the credential is automatically revoked. This eliminates long-lived secrets entirely.
4. **Rotate secrets on a schedule.** Static secrets must be rotated periodically (90 days maximum for high-sensitivity, 365 days for low-sensitivity). Implement dual-read rotation: generate new secret, configure systems to accept both old and new, switch consumers to the new secret, verify, then revoke the old secret. This avoids downtime during rotation.
5. **Revoke secrets immediately on exposure.** If a secret appears in a log file, error message, Git commit, or any unintended location, treat it as compromised. Revoke immediately. Generate a new secret. Investigate how the exposure occurred and fix the root cause. Do not "wait to see if anyone noticed."
6. **Audit all secret access.** The secrets manager must log every access: who requested the secret, when, from where, and whether the request was granted. Alert on anomalies: access from unknown IP ranges, unusual access frequency, access to secrets outside the caller's normal pattern.
7. **Scope secrets to minimum blast radius.** Each service should have its own credentials. Do not share a database password across 10 microservices -- if one is compromised, all are compromised. Service-specific credentials allow targeted revocation without disrupting unaffected services.

**Details:**

- **The secret exposure cascade**: A leaked secret (e.g., AWS access key committed to GitHub) triggers a cascade: bots scan public repos continuously (median detection time by attackers: 1 minute); the key is used to enumerate cloud resources; data is exfiltrated; compute resources are hijacked for cryptomining. The response must be: (1) revoke the key immediately, (2) audit CloudTrail/audit logs for unauthorized access since the commit timestamp, (3) rotate all credentials the leaked key could access, (4) add pre-commit hooks (e.g., truffleHog, git-secrets) to prevent recurrence.
- **Dual-read rotation pattern**: Step 1: Generate new secret B while secret A is still active. Step 2: Configure all consumers to accept both A and B (e.g., database allows both passwords, or the application tries B then falls back to A). Step 3: Update all producers to use B. Step 4: Verify no traffic uses A (via audit logs). Step 5: Revoke A. This zero-downtime rotation is essential for production systems.
- **Short-lived tokens vs static secrets**: Prefer: OAuth2 access tokens (1-hour TTL), Vault dynamic database credentials (1-hour TTL), cloud provider instance metadata tokens (auto-rotated). Avoid: API keys with no expiry, database passwords in config files, SSH private keys that never rotate. The shorter the TTL, the smaller the window of opportunity for a compromised secret.
- **Pre-commit secret scanning**: Tools: truffleHog, git-secrets, gitleaks, GitHub's push protection. Configure as a pre-commit hook and in CI. Block commits that contain high-entropy strings or known secret patterns (AWS key prefix `AKIA`, GitHub tokens starting with `ghp_`). False positive rate is manageable with allowlists.

**Anti-Patterns:**

1. **Secrets in source code or version control.** Once committed, a secret persists in Git history even after deletion. Removing from HEAD is insufficient -- the secret exists in every clone's history. Use `git filter-branch` or BFG Repo Cleaner after exposure, and still treat the secret as compromised.
2. **Shared credentials across services/environments.** Production and staging sharing the same database password. Multiple microservices using the same API key. Compromise of any one consumer compromises all.
3. **Never-rotated secrets.** A secret created in 2019 and never rotated has had 5+ years of potential exposure windows. Establish rotation schedules and automate them.
4. **Secrets in environment variables without a secrets manager.** Environment variables are visible in process listings (`/proc/PID/environ`), crash dumps, debugging tools, and container inspection. They are better than hardcoding but worse than a proper secrets manager. Use a secrets manager and inject secrets directly into the application, not into the environment.
5. **Logging secrets.** Accidentally logging API keys, tokens, or passwords in application logs, error messages, or HTTP request/response logs. Implement log scrubbing (redact patterns matching known secret formats) and never log request/response bodies that may contain credentials.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-secrets-lifecycle knowledge skill`

---

### Task 13: security-audit-log-design

**Depends on:** none
**Files:** `agents/skills/claude-code/security-audit-log-design/SKILL.md`, `agents/skills/claude-code/security-audit-log-design/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-audit-log-design
version: '1.0.0'
description: Security audit log design -- what to log, structured event format, tamper evidence, retention, and the balance between observability and privacy
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-log-correlation
  - security-compliance-logging
  - security-incident-containment
  - security-forensics-fundamentals
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - audit log
  - security logging
  - tamper evidence
  - structured logging
  - event log
  - audit trail
  - log retention
  - security monitoring
  - SIEM
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Audit Log Design`
**Tagline:** `> Log the who, what, when, where, and outcome of every security-relevant event in a structured, tamper-evident format that enables both real-time detection and forensic reconstruction`

**When to Use:**

- Designing the logging infrastructure for a new application
- Adding security event logging to an existing system
- Preparing for SOC2, ISO 27001, HIPAA, or PCI-DSS compliance audits
- Investigating a security incident and discovering logging gaps
- Choosing between application-level and infrastructure-level audit logging
- Designing tamper-evident log storage

**Threat Context:**
Attackers who achieve access to a system routinely attempt to cover their tracks by deleting or modifying logs (log tampering). The 2020 SolarWinds attackers specifically targeted log infrastructure to evade detection. Without adequate audit logging, organizations cannot detect breaches (median detection time without logging: 200+ days, per IBM/Ponemon), cannot reconstruct attack timelines during incident response, and cannot demonstrate compliance to auditors. Logging is not optional overhead -- it is the immune system of the application.

**Instructions:**

1. **Define security-relevant events.** At minimum, log: authentication events (login success/failure, logout, MFA challenges), authorization events (access granted/denied, permission changes), data access events (reads of sensitive data, exports, bulk queries), administrative actions (user creation/deletion, role changes, configuration changes), system events (application start/stop, deployment, certificate rotation), and anomalous events (rate limit triggers, invalid input rejections, unexpected errors).
2. **Use a structured event format.** Every audit event must include:
   - `timestamp`: ISO 8601 with timezone (UTC preferred)
   - `event_type`: Enumerated event category (e.g., `auth.login.success`, `authz.permission.denied`)
   - `actor`: Who performed the action (user ID, service account, system)
   - `action`: What was done (verb, e.g., `read`, `update`, `delete`, `login`)
   - `resource`: What was acted upon (resource type and ID, e.g., `user:12345`, `order:67890`)
   - `outcome`: `success` or `failure` with reason for failures
   - `source_ip`: Where the request originated
   - `session_id`: Session or request correlation ID
   - `metadata`: Additional context (user agent, request path, changed fields for updates)
3. **Log at the application layer, not just infrastructure.** Infrastructure logs (web server access logs, firewall logs) capture network events but miss application-level semantics. "User 123 exported all customer records" is an application event. "GET /api/customers?limit=99999 200 OK" is the infrastructure view. Both are needed; the application event is more actionable.
4. **Make logs tamper-evident.** Options: (a) Write-once storage (S3 Object Lock, WORM tape). (b) Hash chaining: each log entry includes the hash of the previous entry, creating a blockchain-like chain where any modification invalidates all subsequent entries. (c) Forward logs to an independent, append-only log aggregator (Splunk, Elasticsearch, CloudWatch) in real time, so the application server's logs are not the sole copy.
5. **Never log secrets or PII unnecessarily.** Audit logs must not contain passwords, API keys, credit card numbers, social security numbers, or other sensitive data. Log the fact that an action occurred, not the sensitive content. "User 123 updated their password" -- not the password itself. For PII, log only what is needed for investigation (user ID, not full name/email unless required).
6. **Define retention and archival policies.** Compliance frameworks specify minimums: SOC2 typically 1 year, PCI-DSS 1 year (3 months immediately accessible), HIPAA 6 years, GDPR retention must be justified. Archive older logs to cold storage (S3 Glacier, Azure Cool Blob) with integrity verification.
7. **Alert on high-severity events in real time.** Do not wait for someone to read the logs. Configure alerts for: multiple failed login attempts (brute force), privilege escalation events, access to sensitive data outside normal patterns, administrative actions from unusual locations, and any event marked `outcome: failure` on critical operations.

**Details:**

- **The OWASP Logging Cheat Sheet event categories**: Authentication (success, failure, lockout), Authorization (access granted, denied), Session management (creation, destruction, timeout), Input validation failures (rejected input, WAF blocks), Application errors (unhandled exceptions, dependency failures), High-value transactions (financial operations, data exports, configuration changes).
- **Structured logging format example**: JSON-based audit event: `{"timestamp": "2024-01-15T14:30:00Z", "event_type": "authz.permission.denied", "actor": {"user_id": "u-123", "session_id": "s-456"}, "action": "delete", "resource": {"type": "order", "id": "o-789"}, "outcome": "failure", "reason": "insufficient_permissions", "source_ip": "198.51.100.42", "user_agent": "Mozilla/5.0..."}`. Use an enumerated event_type taxonomy so events can be queried consistently.
- **Tamper evidence with hash chaining**: Each log entry includes: `entry_hash = SHA-256(entry_data + previous_entry_hash)`. The first entry uses a known sentinel as the "previous hash." Verification: recompute the hash chain from any point. If any entry is modified, deleted, or inserted, all subsequent hashes fail verification. Store the latest hash in a separate, highly-secured system for independent verification.
- **Log levels vs audit events**: Application log levels (DEBUG, INFO, WARN, ERROR) are for operational troubleshooting. Audit events are a separate concern -- they record security-relevant business events regardless of log level. An audit event for a successful login is not an "error" or a "warning" -- it is a security event. Implement audit logging as a separate subsystem, not as application log statements.

**Anti-Patterns:**

1. **No logging of failed authentication attempts.** Failed logins are the primary signal for brute force attacks, credential stuffing, and account takeover. Not logging them makes these attacks invisible.
2. **Logging everything at DEBUG level in production.** Produces so much noise that security events are buried. Debug logging also risks exposing sensitive data (request bodies, internal state). Use structured audit events for security, not verbose debug output.
3. **Logs stored only on the application server.** If the server is compromised, the attacker deletes the logs. Always forward logs to an independent aggregator in real time.
4. **No correlation IDs.** Without a request/session ID linking related events, reconstructing an attack timeline requires manual timestamp correlation across log sources. Include correlation IDs in every event.
5. **Audit logging as an afterthought.** Adding logging post-launch means the formative period (when configuration is most vulnerable) has no audit trail. Design audit logging alongside the feature, not after deployment.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-audit-log-design knowledge skill`

---

### Task 14: security-memory-safety

**Depends on:** none
**Files:** `agents/skills/claude-code/security-memory-safety/SKILL.md`, `agents/skills/claude-code/security-memory-safety/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-memory-safety
version: '1.0.0'
description: Memory safety vulnerabilities -- buffer overflows, use-after-free, double-free -- and mitigation through safe languages, bounds checking, and memory-safe abstractions
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-injection-families
  - security-race-conditions
  - security-deserialization-attacks
  - owasp-injection-prevention
stack_signals: []
keywords:
  - memory safety
  - buffer overflow
  - use-after-free
  - double-free
  - stack overflow
  - heap overflow
  - bounds checking
  - Rust
  - safe languages
  - memory corruption
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Memory Safety`
**Tagline:** `> Memory corruption vulnerabilities account for 70% of critical CVEs in C/C++ codebases -- choose memory-safe languages by default, and when you cannot, understand the vulnerability classes and mitigations`

**When to Use:**

- Choosing a language for a new system or component (especially systems-level code)
- Reviewing C, C++, or other memory-unsafe code for security vulnerabilities
- Understanding why Rust, Go, Java, C#, Python, and JavaScript are considered "memory-safe" (and what that means)
- Evaluating third-party native dependencies for memory safety risk
- Designing a security architecture that interacts with native/FFI components

**Threat Context:**
Microsoft reported that 70% of its CVEs from 2006-2018 were caused by memory safety issues. Google's Chrome team reported similar numbers (70% of high-severity Chrome security bugs). The 2014 Heartbleed vulnerability (CVE-2014-0160) was a buffer over-read in OpenSSL that exposed private keys, session tokens, and user data from 17% of the internet's HTTPS servers. Memory corruption is the most dangerous vulnerability class because it enables arbitrary code execution -- the attacker does not just read data; they can execute any code on the server.

**Instructions:**

1. **Choose memory-safe languages for new projects.** Rust (compile-time ownership and borrowing guarantees, no garbage collector), Go (garbage collected, bounds-checked arrays), Java/Kotlin (JVM garbage collection, no pointer arithmetic), C# (.NET managed memory), Python, JavaScript/TypeScript, Swift. These languages eliminate entire vulnerability classes by design. The US government (CISA, NSA) now formally recommends memory-safe languages for new development.
2. **Understand the vulnerability taxonomy:**
   - **Buffer overflow (stack/heap)**: Writing beyond the allocated boundary of a buffer. Stack overflow overwrites return addresses (enabling return-to-libc or ROP attacks). Heap overflow corrupts adjacent heap metadata or objects.
   - **Use-after-free**: Accessing memory after it has been freed. If the freed memory is reallocated to a new object, the dangling pointer reads/writes the new object, enabling type confusion and code execution.
   - **Double-free**: Freeing the same memory twice. Corrupts the heap allocator's free list, enabling heap exploitation.
   - **Integer overflow/underflow**: Arithmetic on integers that wrap around, leading to undersized buffer allocations or incorrect bounds checks.
   - **Format string vulnerability**: User-controlled format strings (printf(user_input)) that read or write arbitrary memory.
   - **Null pointer dereference**: Accessing memory through a null pointer. In most modern OSes, this causes a crash (DoS); in kernel code, it can be exploitable.
3. **When using C/C++, apply defense-in-depth mitigations:**
   - Compiler hardening: `-fstack-protector-strong` (stack canaries), `-D_FORTIFY_SOURCE=2` (bounds-checked libc functions), `-fPIE -pie` (position-independent executable for ASLR)
   - OS mitigations: ASLR (Address Space Layout Randomization), DEP/NX (non-executable stack/heap), Control Flow Integrity (CFI)
   - Static analysis: Coverity, clang-tidy, cppcheck, PVS-Studio
   - Dynamic analysis: AddressSanitizer (ASan), MemorySanitizer (MSan), UndefinedBehaviorSanitizer (UBSan), Valgrind
   - Fuzzing: AFL++, libFuzzer for automated input generation that discovers memory bugs
4. **Isolate native/FFI boundaries.** If a memory-safe application calls into C/C++ libraries (via FFI, JNI, WASM), treat the native boundary as a trust boundary. Validate all inputs to native functions. Limit the native component's access to memory and system resources. Use sandboxing (seccomp, WASM isolation) to contain exploitation.
5. **Evaluate native dependencies.** For every C/C++ dependency in your supply chain, assess: Is there a memory-safe alternative (e.g., rustls instead of OpenSSL)? Is the dependency actively maintained? What is its CVE history? How quickly are memory safety bugs patched?

**Details:**

- **How a stack buffer overflow enables code execution**: A local buffer on the stack is adjacent to the return address. Overflowing the buffer overwrites the return address. When the function returns, execution jumps to the attacker-controlled address. Modern mitigations: stack canaries (a random value between the buffer and return address, checked before return), ASLR (randomizes addresses so the attacker cannot predict where to jump), DEP/NX (marks the stack as non-executable so injected shellcode cannot run). Return-Oriented Programming (ROP) bypasses DEP by chaining existing code snippets ("gadgets") already in executable memory.
- **Rust's ownership model**: Rust eliminates use-after-free, double-free, and data races at compile time through its ownership system. Every value has a single owner. When ownership is transferred (moved), the original binding is invalidated. Borrowing rules prevent simultaneous mutable and immutable references. The compiler rejects programs that violate these rules. The `unsafe` block opts out of these checks for FFI or low-level operations -- audit all `unsafe` blocks.
- **WebAssembly (WASM) as a sandboxing mechanism**: Compile C/C++ code to WASM and run it in a sandboxed runtime (Wasmtime, Wasmer). WASM provides linear memory isolation (the module cannot access host memory), capability-based system call access, and deterministic execution. Even if the C code has a buffer overflow, the overflow is confined to the WASM module's linear memory and cannot affect the host.
- **The 70% statistic in context**: Microsoft and Google's data shows 70% of critical/high-severity CVEs are memory safety bugs. This does not mean 70% of all bugs -- it means 70% of the bugs that enable remote code execution, privilege escalation, and information disclosure. Logic bugs, authentication bugs, and authorization bugs make up the remaining 30%. Switching to a memory-safe language eliminates the 70%.

**Anti-Patterns:**

1. **"Our C/C++ code is carefully written, so memory safety is not a concern."** Every large C/C++ codebase has undiscovered memory safety bugs. The question is not whether bugs exist but whether they are found by the developer or the attacker. Use tooling (sanitizers, fuzzing) and prefer safe languages.
2. **Disabling compiler security flags for performance.** Stack canaries, ASLR, and FORTIFY_SOURCE have negligible performance impact in virtually all applications. Disabling them to shave microseconds off a hot path creates exploitable vulnerabilities.
3. **Trusting FFI/native boundary inputs.** Passing user-controlled data directly into native functions without validation. Treat every FFI call as a trust boundary crossing with full input validation.
4. **Ignoring integer overflow in size calculations.** `size = count * element_size` can overflow if both values are attacker-controlled, resulting in a small allocation and subsequent buffer overflow. Use safe math (checked_mul in Rust, Math.addExact in Java) or validate inputs before arithmetic.
5. **"We use a memory-safe language, so memory safety is not our problem."** Memory-safe languages can still call into unsafe native code (FFI, native extensions, WASM). Python's C extensions, Node.js's native addons, and Java's JNI all introduce memory-unsafe code. Audit the native boundary.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-memory-safety knowledge skill`

---

### Task 15: security-injection-families

**Depends on:** none
**Files:** `agents/skills/claude-code/security-injection-families/SKILL.md`, `agents/skills/claude-code/security-injection-families/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-injection-families
version: '1.0.0'
description: Unified mental model for injection vulnerabilities -- SQL, command, LDAP, XSS, template, header -- all share the same root cause of mixing code and data
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - security-memory-safety
  - security-deserialization-attacks
  - security-trust-boundaries
  - owasp-injection-prevention
  - owasp-xss-prevention
  - owasp-security-headers
stack_signals: []
keywords:
  - injection
  - SQL injection
  - command injection
  - XSS
  - cross-site scripting
  - LDAP injection
  - template injection
  - header injection
  - code and data separation
  - parameterized queries
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Injection Families`
**Tagline:** `> Every injection vulnerability has the same root cause: untrusted data is interpreted as code because the boundary between data and instructions was not enforced -- fix the boundary, fix the bug`

**When to Use:**

- Reviewing code that constructs queries, commands, or markup from user input
- Designing input handling for a new application or API
- Understanding the relationship between SQL injection, XSS, command injection, and other injection types
- Training developers on secure coding fundamentals
- Evaluating whether a framework's built-in protections are sufficient

**Threat Context:**
Injection (OWASP A03:2021) has been in the OWASP Top 10 since its inception. SQL injection alone has caused some of the largest breaches in history: Heartland Payment Systems (2008, 130M credit cards), Sony Pictures (2011), TalkTalk (2015, 157k customers). The 2023 MOVEit Transfer breach (SQL injection in a file transfer product) affected 2,500+ organizations and 65+ million individuals. Despite being well-understood for 25+ years, injection remains prevalent because the root cause -- mixing code and data -- recurs in every new technology layer.

**Instructions:**

1. **Understand the universal pattern.** Every injection vulnerability follows the same structure: (a) the application constructs an instruction (SQL query, shell command, HTML page, LDAP query, template) by concatenating trusted code with untrusted data, (b) the interpreter (database engine, shell, browser, LDAP server, template engine) cannot distinguish the data from the code, (c) attacker-supplied data contains instruction syntax that alters the intended behavior.
2. **The universal fix: enforce the code/data boundary.** Use mechanisms that structurally separate data from instructions:
   - **Parameterized queries** (SQL injection): `SELECT * FROM users WHERE id = ?` with the value passed separately. The database engine never interprets the parameter as SQL syntax.
   - **Context-aware output encoding** (XSS): HTML-encode when inserting into HTML content, attribute-encode when inserting into HTML attributes, JS-encode when inserting into JavaScript, URL-encode when inserting into URLs. The browser never interprets the encoded data as markup or script.
   - **Avoid shell execution** (command injection): Use language APIs (file system functions, process spawn with argument arrays) instead of shell invocation. If shell is unavoidable, use parameterized execution (execFile with argument array, not exec with string concatenation).
   - **Parameterized LDAP queries** (LDAP injection): Use the language's LDAP library with proper value escaping/parameterization.
   - **Sandboxed template engines** (template injection): Use logic-less templates (Mustache) or template engines with sandbox modes that prevent arbitrary code execution.
   - **Strict header parsing** (header injection/CRLF injection): Reject input containing CR/LF characters before inserting into HTTP headers.
3. **Apply input validation as defense-in-depth, not as the primary fix.** Allowlist validation (e.g., "this field must be a positive integer") rejects many injection payloads but is not a complete fix. Blacklist validation ("reject input containing SQL keywords") is always bypassable. Parameterization is the primary fix; validation is a supporting layer.
4. **Recognize injection surfaces in your stack.** For each technology layer: What interpreter processes the data? Can user input reach that interpreter? Is the input parameterized or concatenated? Common surfaces: SQL databases, NoSQL databases (MongoDB $where, operator injection), operating system shells, browser rendering engine (DOM), email headers (header injection), HTTP headers (CRLF injection), template engines (SSTI), XML parsers (XXE), LDAP directories, GraphQL resolvers, regular expression engines (ReDoS).
5. **Use framework-provided protections.** Modern frameworks parameterize by default: ORMs generate parameterized SQL, React escapes JSX content by default, Angular sanitizes template bindings. The vulnerability occurs when developers bypass these protections: raw SQL queries, dangerouslySetInnerHTML in React, [innerHTML] in Angular, template literals in template engines. Audit every bypass.

**Details:**

- **Injection family taxonomy**: SQL injection (interpreter: SQL engine), NoSQL injection (interpreter: document store query engine), Command injection / OS injection (interpreter: shell), Cross-site scripting / XSS (interpreter: browser), Server-side template injection / SSTI (interpreter: template engine), LDAP injection (interpreter: LDAP directory), XPath injection (interpreter: XML query engine), Header injection / CRLF injection (interpreter: HTTP parser), Expression Language injection / EL injection (interpreter: Java EL engine), GraphQL injection (interpreter: GraphQL resolver), ReDoS (interpreter: regex engine). All share the same root cause.
- **Second-order injection**: Data is stored safely (parameterized) but later retrieved and used unsafely in a different context. Example: a username is stored in the database via a parameterized query (safe), but later the username is concatenated into a log file or an admin dashboard without encoding (vulnerable to stored XSS or log injection). Every output context requires its own encoding, regardless of how the data was stored.
- **Blind injection and out-of-band exfiltration**: When the application does not return the injected query's results directly, attackers use blind techniques: boolean-based (observing whether the response changes based on true/false conditions in the injection), time-based (introducing delays via SLEEP() and measuring response time), and out-of-band (forcing the database to make DNS or HTTP requests to an attacker-controlled server carrying exfiltrated data). Parameterization prevents all of these.
- **The defense-in-depth stack for injection**: Layer 1: Parameterization (eliminates the vulnerability). Layer 2: Input validation (rejects obviously malicious input). Layer 3: WAF rules (catches common patterns, but bypassable). Layer 4: Least privilege database accounts (limits damage if injection occurs). Layer 5: Error handling (never expose SQL errors, stack traces, or internal structure to the user). All layers should be present; none is sufficient alone.

**Anti-Patterns:**

1. **String concatenation for query construction.** `query = "SELECT * FROM users WHERE name = '" + name + "'"`. This is the canonical injection vulnerability. Use parameterized queries exclusively.
2. **Blacklist-based input validation as the sole defense.** Filtering "DROP TABLE", "UNION SELECT", "<script>" from input. Attackers use encoding, case variation, comment injection, and dozens of other bypass techniques. Blacklists never cover all attack vectors.
3. **"We use an ORM, so SQL injection is impossible."** ORMs generate parameterized queries for standard operations, but every ORM provides an escape hatch for raw queries. Developers under time pressure use raw queries with string concatenation. Audit every raw query invocation.
4. **Trusting data from "internal" sources.** Data from internal APIs, message queues, or databases still requires parameterization when used in a different interpreter context. If Service A stores user input in a database and Service B reads it and constructs a shell command, Service B has a command injection vulnerability regardless of Service A's input validation.
5. **Client-side validation as a security control.** JavaScript validation in the browser is a UX feature, not a security control. Attackers bypass client-side validation trivially (curl, Postman, browser dev tools). All validation must be enforced server-side.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-injection-families knowledge skill`

---

### Task 16: Cross-platform replication

**Depends on:** Tasks 1-15
**Files:** All 15 skill directories replicated to gemini-cli, cursor, and codex (45 directories, 90 files)

1. For each of the 15 skills created under `agents/skills/claude-code/security-*/`:
   - Copy the entire directory to `agents/skills/gemini-cli/security-<topic>/`
   - Copy the entire directory to `agents/skills/cursor/security-<topic>/`
   - Copy the entire directory to `agents/skills/codex/security-<topic>/`

2. Execute the copy via shell:

```bash
for skill in security-threat-modeling-stride security-threat-modeling-process security-trust-boundaries security-symmetric-encryption security-asymmetric-encryption security-hashing-fundamentals security-credential-storage security-session-management security-rbac-design security-zero-trust-principles security-tls-fundamentals security-secrets-lifecycle security-audit-log-design security-memory-safety security-injection-families; do
  cp -r agents/skills/claude-code/$skill agents/skills/gemini-cli/$skill
  cp -r agents/skills/claude-code/$skill agents/skills/cursor/$skill
  cp -r agents/skills/claude-code/$skill agents/skills/codex/$skill
done
```

3. Verify: count directories to confirm 60 total (15 x 4 platforms):

```bash
ls -d agents/skills/*/security-* | wc -l
# Expected: 60
```

4. Run: `harness validate`
5. Commit: `feat(skills): replicate 15 security skills to gemini-cli, cursor, and codex platforms`

---

### Task 17: Final validation

[checkpoint:human-verify]

**Depends on:** Task 16
**Files:** none (validation only)

1. Verify all 60 skill directories exist:

```bash
for platform in claude-code gemini-cli cursor codex; do
  echo "=== $platform ==="
  ls agents/skills/$platform/security-* -d | wc -l
  # Expected: 15 per platform
done
```

2. Verify all SKILL.md files have the required sections:

```bash
for f in agents/skills/claude-code/security-*/SKILL.md; do
  name=$(dirname $f | xargs basename)
  sections=$(grep -c '^## ' $f)
  lines=$(wc -l < $f)
  echo "$name: $sections sections, $lines lines"
done
# Expected: each skill has 5 H2 sections (When to Use, Threat Context, Instructions, Details, Anti-Patterns) and 150-250 lines
```

3. Verify all skill.yaml files have correct metadata:

```bash
for f in agents/skills/claude-code/security-*/skill.yaml; do
  name=$(dirname $f | xargs basename)
  type=$(grep 'type: knowledge' $f | wc -l)
  mode=$(grep 'cognitive_mode: advisory-guide' $f | wc -l)
  tier=$(grep 'tier: 3' $f | wc -l)
  echo "$name: type=$type mode=$mode tier=$tier"
done
# Expected: all values = 1
```

4. Verify cross-platform parity (all platforms have identical files):

```bash
for skill in agents/skills/claude-code/security-*/; do
  name=$(basename $skill)
  diff -q agents/skills/claude-code/$name/SKILL.md agents/skills/gemini-cli/$name/SKILL.md
  diff -q agents/skills/claude-code/$name/SKILL.md agents/skills/cursor/$name/SKILL.md
  diff -q agents/skills/claude-code/$name/SKILL.md agents/skills/codex/$name/SKILL.md
done
# Expected: no output (all files identical)
```

5. Run: `harness validate`
6. Present results to human for sign-off.

---

## Observable Truth Traceability

| Observable Truth                                         | Delivered By                     |
| -------------------------------------------------------- | -------------------------------- |
| 1. 15 skill directories exist under claude-code          | Tasks 1-15                       |
| 2. Each has SKILL.md (150-250 lines) and skill.yaml      | Tasks 1-15                       |
| 3. Every SKILL.md has all 7 sections in order            | Tasks 1-15                       |
| 4. Every skill.yaml has correct metadata and owasp links | Tasks 1-15                       |
| 5. Identical copies in all 4 platforms (60 dirs)         | Task 16                          |
| 6. No framework-specific code                            | Tasks 1-15 (content requirement) |
| 7. Threat Context names specific attack classes          | Tasks 1-15 (content requirement) |
| 8. harness validate passes                               | Task 17                          |
