# Plan: Security Fundamentals Phase 2 -- Extended Coverage

**Date:** 2026-04-09
**Spec:** docs/changes/security-fundamentals-knowledge-skills/proposal.md
**Estimated tasks:** 32
**Estimated time:** 160 minutes

## Goal

Create the remaining 30 security knowledge skills (Phase 2 of 45 total) and replicate them to all 4 platform directories, completing the conceptual security layer beneath the existing `owasp-*` implementation checklists.

## Observable Truths (Acceptance Criteria)

1. 30 new skill directories exist under `agents/skills/claude-code/` with names matching the Phase 2 list.
2. Each of the 30 directories contains a `SKILL.md` (150-250 lines) and a `skill.yaml`.
3. Every `SKILL.md` contains all 7 required sections in order: H1 title, blockquote tagline, When to Use, Threat Context, Instructions, Details, Anti-Patterns.
4. Every `skill.yaml` has `type: knowledge`, `cognitive_mode: advisory-guide`, `tier: 3`, `platforms` listing all four platforms, and at least one `owasp-*` skill in `related_skills` where a topical match exists.
5. Identical copies of each skill directory exist under `agents/skills/gemini-cli/`, `agents/skills/cursor/`, and `agents/skills/codex/` (120 directories total = 30 skills x 4 platforms).
6. No framework-specific implementation code appears in any SKILL.md -- only pseudocode and language-agnostic patterns.
7. Every Threat Context section names specific attack classes (not vague "security risks").
8. `harness validate` passes after all skills are created.

## File Map

### CREATE (120 directories, 240 files -- listed for claude-code, replicated to 3 other platforms)

Per-skill (repeated for each of 30 skills):

- `agents/skills/claude-code/security-<topic>/SKILL.md`
- `agents/skills/claude-code/security-<topic>/skill.yaml`

30 skills:

- `security-attack-trees`
- `security-hmac-signatures`
- `security-cryptographic-randomness`
- `security-mfa-design`
- `security-authentication-flows`
- `security-abac-design`
- `security-rebac-design`
- `security-capability-based-security`
- `security-microsegmentation`
- `security-identity-verification`
- `security-vault-patterns`
- `security-environment-variable-risks`
- `security-certificate-management`
- `security-hsts-preloading`
- `security-mtls-design`
- `security-dependency-auditing`
- `security-sbom-provenance`
- `security-code-signing`
- `security-shift-left-design`
- `security-ci-security-testing`
- `security-penetration-testing`
- `security-security-champions`
- `security-log-correlation`
- `security-compliance-logging`
- `security-deserialization-attacks`
- `security-race-conditions`
- `security-incident-containment`
- `security-forensics-fundamentals`
- `security-vulnerability-disclosure`
- `security-post-incident-review`

Cross-platform copies (90 directories, 180 files):

- `agents/skills/gemini-cli/security-<topic>/SKILL.md` (x30)
- `agents/skills/gemini-cli/security-<topic>/skill.yaml` (x30)
- `agents/skills/cursor/security-<topic>/SKILL.md` (x30)
- `agents/skills/cursor/security-<topic>/skill.yaml` (x30)
- `agents/skills/codex/security-<topic>/SKILL.md` (x30)
- `agents/skills/codex/security-<topic>/skill.yaml` (x30)

## Tasks

---

### Task 1: security-attack-trees

**Depends on:** none
**Files:** `agents/skills/claude-code/security-attack-trees/SKILL.md`, `agents/skills/claude-code/security-attack-trees/skill.yaml`

1. Create directory `agents/skills/claude-code/security-attack-trees/`.

2. Create `skill.yaml`:

```yaml
name: security-attack-trees
version: '1.0.0'
description: Attack tree construction and analysis -- modeling multi-step adversary strategies as goal-oriented tree decompositions for prioritizing defenses
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
  - security-trust-boundaries
  - owasp-auth-patterns
stack_signals: []
keywords:
  - attack tree
  - threat analysis
  - attack path
  - adversary modeling
  - risk prioritization
  - kill chain
  - attack graph
  - defense in depth
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

3. Create `SKILL.md` (150-250 lines):

**H1:** `# Attack Tree Construction and Analysis`
**Tagline:** `> Model multi-step adversary strategies as goal-oriented tree decompositions -- revealing which attack paths are cheapest and which defenses yield the highest leverage`

**When to Use:**

- Analyzing a specific high-value asset (payment system, admin panel, key store) for all possible attack paths
- Supplementing STRIDE breadth analysis with depth analysis on the most critical threats
- Communicating attack scenarios to non-technical stakeholders using visual decompositions
- Prioritizing security investment by comparing the cost of attack paths vs cost of defenses
- Evaluating whether defense-in-depth is effective by checking if all paths require defeating multiple controls
- Performing red team planning or tabletop exercises

**Threat Context:**
Attack trees were formalized by Bruce Schneier in 1999, building on fault tree analysis from reliability engineering. They model an attacker's goal as the root node and decompose it into sub-goals connected by AND (all required) and OR (any sufficient) relationships. STRIDE identifies individual threats; attack trees reveal how threats chain together into multi-step attack campaigns. The 2020 SolarWinds attack exemplified a multi-step chain: compromise build system (supply chain), inject backdoor into update (tampering), establish C2 via DNS (exfiltration), move laterally to email systems (privilege escalation). No single-threat analysis captures this -- attack trees do.

**Instructions:**

1. **Define the root goal from the attacker's perspective.** Use concrete adversary objectives: "Exfiltrate customer PII from the database," "Execute arbitrary code on the production server," "Impersonate an administrator." Vague goals like "compromise the system" produce vague trees.
2. **Decompose into sub-goals using AND/OR nodes.** OR nodes mean the attacker needs any one child to succeed. AND nodes mean the attacker needs all children to succeed. Example: "Gain database access" OR [SQL injection in search endpoint, stolen DBA credentials, compromised backup file]. "Steal DBA credentials" AND [obtain password hash, crack hash offline].
3. **Annotate leaf nodes with attributes.** At minimum: cost to attacker (low/medium/high), technical skill required, detectability (stealthy/noisy), whether the attack requires insider access.
4. **Compute path costs bottom-up.** For OR nodes, the cheapest child determines the path cost. For AND nodes, the most expensive child determines the path cost (the bottleneck). The cheapest root-to-leaf path is the attacker's preferred strategy.
5. **Identify cut points.** A cut point is a node where a single defense eliminates an entire subtree. Investing in a defense at a cut point has higher leverage than defending individual leaf nodes. Example: enforcing parameterized queries eliminates the entire "SQL injection" subtree regardless of how many injection entry points exist.
6. **Validate completeness.** For every OR node, ask: "Are there other ways to achieve this sub-goal I have not listed?" For every AND node, ask: "Does the attacker truly need all of these, or can they skip one?" Incomplete trees give false confidence.
7. **Iterate and refine.** Attack trees are living documents. When new features are added, extend the tree. When vulnerabilities are discovered, add the attack path. When defenses are deployed, mark the corresponding nodes as mitigated and re-compute path costs.

**Details:**

- **AND/OR tree formalism**: Explain how OR nodes model alternatives and AND nodes model prerequisites. Show a textual tree notation: indented lines with `[OR]` and `[AND]` markers. Show how to convert to a visual diagram (boxes connected by arcs, with an arc connecting AND children).
- **Worked example -- "Exfiltrate customer database"**: Root: Exfiltrate customer PII. OR: (1) SQL injection via web app, (2) Compromise database credentials, (3) Access unencrypted backup. Branch (2) is AND: (2a) Obtain credential from config file OR source code OR env variable, (2b) Network access to database port. Show cost annotations. Demonstrate that encrypting backups eliminates branch (3) entirely (cut point), while network segmentation raises the cost of branch (2b).
- **Attack trees vs kill chains**: Kill chains (Lockheed Martin Cyber Kill Chain, MITRE ATT&CK) model sequential phases of an intrusion (recon -> weaponize -> deliver -> exploit -> install -> C2 -> actions). Attack trees model all possible paths to a specific goal. Kill chains answer "what does an intrusion campaign look like?" Attack trees answer "how many ways can an attacker reach this specific asset?"
- **Quantitative vs qualitative annotation**: Qualitative (low/medium/high) is sufficient for most threat modeling. Quantitative (dollar cost, probability of success, time to execute) is useful when justifying security budget to executives -- "the cheapest attack path costs $5,000; deploying this WAF raises it to $50,000."
- **Tool support**: SecurITree (commercial), ADTool (academic, free), or plain-text Markdown trees in the repository. For most teams, a Markdown document with indented node notation is sufficient and has the advantage of being version-controlled alongside the code.

**Anti-Patterns:**

1. **Trees without cost annotations.** An attack tree that shows possible paths but does not annotate cost, skill, or detectability is a brainstorming artifact, not an analysis tool. Without annotations, all paths look equally likely, and the team cannot prioritize defenses.
2. **Only modeling external attackers.** Attack trees often omit insider threats: a disgruntled employee with production access, a contractor with VPN credentials, a compromised CI/CD service account. Include at least one branch per tree that starts with "attacker has internal access."
3. **Treating the tree as static.** An attack tree from 6 months ago does not reflect the three new API endpoints, the new third-party integration, or the infrastructure migration. Review and extend trees when the system changes.
4. **Confusing attack trees with fault trees.** Fault trees model accidental failures; attack trees model intentional adversary behavior. The decomposition logic is similar, but the node semantics differ -- attack tree nodes represent adversary choices, not random failure modes. Using fault tree assumptions (independent failures, known failure rates) for attack trees produces unreliable risk estimates because adversaries are adaptive, not random.
5. **Over-decomposition.** A tree with 200 leaf nodes is unworkable. Focus on the top 3-5 high-value assets and build one tree per asset. Each tree should have 15-30 leaf nodes. If a subtree is too complex, extract it into its own tree and link them.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-attack-trees knowledge skill`

---

### Task 2: security-hmac-signatures

**Depends on:** none
**Files:** `agents/skills/claude-code/security-hmac-signatures/SKILL.md`, `agents/skills/claude-code/security-hmac-signatures/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-hmac-signatures
version: '1.0.0'
description: HMAC for message authentication and digital signatures for non-repudiation -- when to use which, how they fail, and implementation pitfalls
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
  - security-symmetric-encryption
  - security-asymmetric-encryption
  - security-cryptographic-randomness
  - owasp-cryptography
stack_signals: []
keywords:
  - HMAC
  - digital signature
  - message authentication code
  - MAC
  - RSA signature
  - ECDSA
  - Ed25519
  - webhook verification
  - JWT signing
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# HMAC and Digital Signatures`
**Tagline:** `> HMAC proves a message was created by someone with the shared secret; digital signatures prove it was created by a specific private key holder -- choose based on whether you need symmetric verification or non-repudiation`

**When to Use:**

- Verifying webhook payloads from third-party services (Stripe, GitHub, Slack)
- Signing JWTs and choosing between HS256 and RS256/ES256
- Authenticating API requests between internal services
- Signing software artifacts, commits, or release packages
- Designing a system that requires non-repudiation (proving who did what)
- Implementing message integrity checks on data in transit or at rest

**Threat Context:**
Message authentication failures enable man-in-the-middle tampering, webhook forgery, and API request replay. The 2022 Heroku/GitHub OAuth token theft exploited stolen HMAC secrets to forge session tokens. Weak HMAC implementations using plain SHA-256 instead of HMAC-SHA-256 are vulnerable to length extension attacks. JWT libraries that accept `alg: none` or allow algorithm confusion (treating an RSA public key as an HMAC secret) have caused authentication bypasses in Auth0 (2015), Okta, and countless custom implementations.

**Instructions:**

1. **Understand the core distinction.** HMAC uses a shared symmetric key -- both the signer and verifier possess the same secret. Digital signatures use an asymmetric key pair -- only the private key holder can sign, but anyone with the public key can verify. HMAC provides authentication (who sent this?) and integrity (was it modified?). Digital signatures additionally provide non-repudiation (the signer cannot deny signing).
2. **Use HMAC for symmetric trust relationships.** When both parties share a secret (webhook provider and your server, two internal microservices), HMAC-SHA-256 is the standard choice. Compute: `HMAC(key, message)` and compare using constant-time comparison. Never use string equality (`==`) -- timing side channels leak information about the correct MAC.
3. **Use digital signatures when the verifier should not be able to sign.** When the signer and verifier are different trust domains (package signing where users verify, JWT issuance where resource servers verify, code signing), use asymmetric signatures. Recommended algorithms: Ed25519 (fast, small signatures, no configuration pitfalls), ECDSA with P-256 (widely supported, NIST approved), RSA-PSS with 2048+ bit keys (legacy compatibility).
4. **Prevent algorithm confusion.** In JWT systems, always validate the `alg` header server-side against an allowlist. Never let the token specify which algorithm to use. The classic JWT vulnerability: the server expects RS256 (asymmetric) but the attacker sends a token with `alg: HS256` and uses the RSA public key (which is public) as the HMAC secret.
5. **Include anti-replay mechanisms.** HMAC and signatures prove integrity and origin but not freshness. Add a timestamp or nonce to the signed payload and reject messages older than a threshold (e.g., 5 minutes). For critical operations, store seen nonces and reject duplicates within the validity window.
6. **Rotate keys.** HMAC secrets and signing keys must have rotation schedules. Support multiple active keys during rotation (verify against both old and new keys for a transition period, sign only with the new key). Publish key rotation schedules for digital signature keys via JWKS endpoints or key transparency logs.

**Details:**

- **HMAC internals**: HMAC-SHA-256 computes `SHA-256((key XOR opad) || SHA-256((key XOR ipad) || message))` where ipad and opad are fixed padding constants. This nested construction prevents length extension attacks that affect plain `SHA-256(key || message)`. Explain why `SHA-256(key || message)` is insecure (attacker can append data and compute a valid hash without knowing the key due to Merkle-Damgard construction).
- **Signature scheme comparison table**: Compare HMAC-SHA-256, RSA-2048 (PKCS#1 v1.5 and PSS), ECDSA P-256, and Ed25519 across: key size, signature size, signing speed, verification speed, non-repudiation support, common pitfalls.
- **Webhook verification worked example**: Receive POST with `X-Signature` header. Extract the raw body (before JSON parsing -- parsing can reorder fields). Compute `HMAC-SHA-256(webhook_secret, raw_body)`. Compare hex-encoded result with header value using constant-time comparison. Show the timing attack that occurs with `===` comparison.
- **JWT algorithm selection**: HS256 is appropriate only when the issuer and audience are the same service. RS256/ES256 is mandatory when tokens are verified by a different service than the issuer. EdDSA (Ed25519) is preferred for new systems -- smallest tokens, fastest verification, no padding oracle risk.

**Anti-Patterns:**

1. **Using `SHA-256(secret + message)` instead of HMAC.** Vulnerable to length extension attacks on Merkle-Damgard hash functions. The attacker can append data to the message and compute a valid MAC without knowing the secret.
2. **Comparing MACs with string equality.** Timing side channels allow an attacker to guess the correct MAC byte by byte by measuring response times. Always use constant-time comparison functions (`crypto.timingSafeEqual` in Node.js, `hmac.compare_digest` in Python, `subtle.ConstantTimeCompare` in Go).
3. **Hardcoding HMAC secrets in source code.** Secrets in code end up in version control, CI logs, error messages, and developer laptops. Store HMAC secrets in a secrets manager (Vault, AWS Secrets Manager, environment-injected secrets) and rotate them.
4. **Allowing JWT `alg: none`.** Some JWT libraries accept unsigned tokens when the algorithm header is `none`. Always validate the algorithm against a server-side allowlist and reject `none`.
5. **No key rotation plan.** A leaked HMAC secret or signing key with no rotation mechanism means revoking all existing tokens/signatures and coordinating an emergency key change. Design key rotation into the system from day one.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-hmac-signatures knowledge skill`

---

### Task 3: security-cryptographic-randomness

**Depends on:** none
**Files:** `agents/skills/claude-code/security-cryptographic-randomness/SKILL.md`, `agents/skills/claude-code/security-cryptographic-randomness/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-cryptographic-randomness
version: '1.0.0'
description: Cryptographically secure random number generation -- CSPRNG, entropy sources, nonce generation, and why Math.random() will get you breached
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
  - security-hashing-fundamentals
  - security-hmac-signatures
  - security-session-management
  - owasp-cryptography
stack_signals: []
keywords:
  - CSPRNG
  - entropy
  - random number generation
  - nonce
  - initialization vector
  - IV
  - Math.random
  - crypto.getRandomValues
  - /dev/urandom
  - token generation
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Cryptographic Randomness`
**Tagline:** `> Every session token, encryption key, nonce, and CSRF token depends on unpredictable randomness -- use a CSPRNG or accept that attackers will predict your secrets`

**When to Use:**

- Generating session tokens, API keys, CSRF tokens, or password reset tokens
- Creating initialization vectors (IVs) or nonces for encryption
- Generating cryptographic key material
- Selecting random values for any security-sensitive operation (salts, verification codes, OTPs)
- Auditing existing code for insecure randomness sources

**Threat Context:**
Predictable random number generators have caused catastrophic breaches. The 2012 Android Bitcoin wallet vulnerability used a broken PRNG that reused ECDSA nonces, allowing private key extraction and theft of 55 BTC. The 2008 Debian OpenSSL bug reduced the entropy pool to 15 bits (32,768 possible keys), making all SSL certificates, SSH keys, and VPN keys generated on affected systems trivially crackable. PHP's `mt_rand()` and JavaScript's `Math.random()` use Mersenne Twister, which is fully predictable after observing 624 outputs. Any security token generated from a non-cryptographic PRNG can be predicted and forged.

**Instructions:**

1. **Always use the platform's CSPRNG.** Node.js: `crypto.randomBytes()` or `crypto.randomUUID()`. Python: `secrets` module (`secrets.token_hex()`, `secrets.token_urlsafe()`). Go: `crypto/rand.Read()`. Java: `java.security.SecureRandom`. Ruby: `SecureRandom.hex()`. Browser: `crypto.getRandomValues()`. Never use `Math.random()`, `random.random()`, `rand()`, or `mt_rand()` for security purposes.
2. **Understand entropy sources.** On Linux, `/dev/urandom` reads from the kernel entropy pool seeded by hardware interrupts, disk timing, network events, and CPU jitter. On modern kernels (5.6+), `/dev/urandom` blocks until sufficient entropy is available at boot. `/dev/random` vs `/dev/urandom` is a historical debate -- on modern Linux, `/dev/urandom` is correct for all cryptographic purposes. On Windows, `BCryptGenRandom` (via CNG) is the equivalent.
3. **Size tokens correctly.** Session tokens: minimum 128 bits (16 bytes) of randomness, typically encoded as 32 hex characters or 22 base64url characters. API keys: 256 bits. Encryption keys: match the algorithm requirement (AES-256 needs 256 bits). CSRF tokens: 128 bits minimum.
4. **Never reuse nonces.** AES-GCM nonces must be unique per key -- reusing a nonce with the same key completely breaks GCM's authentication and leaks plaintext via XOR of ciphertexts. For AES-GCM with 96-bit nonces, use a counter (if you can guarantee no resets) or random nonces (safe for up to 2^32 encryptions per key before birthday collision risk exceeds acceptable thresholds).
5. **Seed correctly in containers and VMs.** Containers and VMs may have low entropy at boot because they lack hardware interrupt diversity. Ensure the host provides entropy to guests (virtio-rng, haveged). Cloud providers (AWS, GCP, Azure) seed guest entropy from hardware RNGs. Verify by checking `cat /proc/sys/kernel/random/entropy_avail` -- values below 256 indicate a problem.
6. **Audit for insecure randomness.** Search codebases for `Math.random`, `random.random`, `rand()`, `mt_rand()`, `srand()`, `time()` used as seed. These are security vulnerabilities when used for tokens, keys, nonces, or any value an attacker benefits from predicting.

**Details:**

- **Why Math.random() is predictable**: Explain Mersenne Twister (MT19937) internals -- 624 32-bit state words, linear recurrence, fully recoverable after observing 624 outputs. Show that an attacker who can observe generated values (e.g., sequential resource IDs, leaked tokens in logs) can reconstruct the state and predict all future outputs.
- **Birthday paradox and nonce collision**: For a random n-bit nonce, the probability of collision exceeds 50% after 2^(n/2) uses. For a 96-bit GCM nonce, this is 2^48 (~281 trillion) -- safe for most applications but insufficient for high-volume encryption. For safety margins, rotate keys before reaching 2^32 encryptions per key.
- **CSPRNG comparison table**: Compare `/dev/urandom`, `getrandom(2)`, `BCryptGenRandom`, `arc4random`, RDRAND/RDSEED across: entropy source, blocking behavior, fork safety, VM safety, performance.
- **Token generation best practices**: Generate tokens as raw bytes, then encode. Prefer base64url encoding (URL-safe, no padding) over hex (doubles the length). Include the generation timestamp in the token or store it server-side for expiration enforcement.

**Anti-Patterns:**

1. **Using `Math.random()` or `random.random()` for security tokens.** These are pseudorandom, not cryptographically secure. Mersenne Twister state is fully recoverable. Use `crypto.randomBytes()` (Node.js) or `secrets.token_hex()` (Python).
2. **Seeding with the current time.** `srand(time(NULL))` produces 1-second resolution seeds -- an attacker who knows approximately when the token was generated can brute-force the seed in seconds. CSPRNGs do not require manual seeding.
3. **Using UUIDv4 as security tokens without verification.** UUIDv4 provides 122 bits of randomness but many UUID libraries use non-cryptographic PRNGs internally. Verify that your UUID library uses the OS CSPRNG, or generate tokens directly from `crypto.randomBytes()`.
4. **Reusing nonces across encryption operations.** AES-GCM nonce reuse with the same key reveals the XOR of two plaintexts and breaks authentication entirely. Use a counter or random nonces with key rotation.
5. **Ignoring entropy starvation in containers.** Containers without access to the host's entropy pool may block or produce low-quality randomness. Check entropy availability at startup and fail fast if insufficient.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-cryptographic-randomness knowledge skill`

---

### Task 4: security-mfa-design

**Depends on:** none
**Files:** `agents/skills/claude-code/security-mfa-design/SKILL.md`, `agents/skills/claude-code/security-mfa-design/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-mfa-design
version: '1.0.0'
description: Multi-factor authentication design -- TOTP, WebAuthn/passkeys, SMS risks, recovery flows, and step-up authentication for sensitive operations
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
  - security-session-management
  - security-authentication-flows
  - security-cryptographic-randomness
  - owasp-auth-patterns
stack_signals: []
keywords:
  - MFA
  - multi-factor authentication
  - TOTP
  - WebAuthn
  - passkeys
  - FIDO2
  - two-factor
  - 2FA
  - recovery codes
  - step-up authentication
  - SMS verification
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Multi-Factor Authentication Design`
**Tagline:** `> Something you know, something you have, something you are -- combining authentication factors so that compromising one factor alone is insufficient to gain access`

**When to Use:**

- Adding MFA to an existing authentication system
- Choosing between TOTP, WebAuthn/passkeys, SMS, and email as second factors
- Designing recovery flows for users who lose their second factor
- Implementing step-up authentication for sensitive operations (payment, account changes)
- Evaluating the security properties of different MFA factor types
- Migrating from SMS-based 2FA to phishing-resistant alternatives

**Threat Context:**
Credential stuffing attacks use billions of leaked username/password combinations from breaches (Collection #1 had 773 million email addresses). Without MFA, every breached password is a working credential. Google reported that SMS-based 2FA blocks 100% of automated bot attacks, 96% of bulk phishing, but only 76% of targeted attacks (because SIM-swap and SS7 interception defeat SMS). WebAuthn/FIDO2 blocks 100% of phishing because the credential is bound to the origin -- a phishing site at `evil.com` cannot trigger a credential for `bank.com`. The 2022 Uber breach started with MFA fatigue: the attacker spammed push notifications until the employee approved one at 1AM.

**Instructions:**

1. **Understand the three factor categories.** Knowledge (passwords, PINs, security questions), Possession (phone, hardware key, authenticator app), Inherence (fingerprint, face, iris). True MFA requires factors from at least two different categories. Two passwords are not MFA. A password plus a TOTP code (possession of the phone/app) is MFA.
2. **Prefer phishing-resistant factors.** WebAuthn/FIDO2 (hardware keys like YubiKey, platform authenticators like Touch ID/Windows Hello, passkeys) is phishing-resistant because the browser binds the credential to the origin. TOTP is phishable (attacker shows fake login page, user types TOTP code, attacker replays it in real time). SMS is phishable and additionally vulnerable to SIM swap and SS7 attacks. Ranking: WebAuthn > TOTP > Email > SMS.
3. **Implement TOTP correctly.** Use RFC 6238 with SHA-1 (the standard -- SHA-256/512 are allowed but not universally supported by authenticator apps), 6-digit codes, 30-second time step. Allow a window of +/- 1 time step (90 seconds total) to handle clock drift. Store the shared secret encrypted at rest. Display QR code using the `otpauth://` URI format. Offer backup codes (8-10 single-use codes, 8 characters each, stored hashed).
4. **Design the enrollment flow.** Present the QR code for TOTP enrollment. Require the user to enter a valid TOTP code to confirm enrollment before activating MFA. For WebAuthn, use the `navigator.credentials.create()` API with `attestation: "none"` (sufficient for most applications -- attestation verification is complex and rarely needed). Allow users to register multiple credentials (backup key, phone, etc.).
5. **Design the recovery flow.** Recovery codes are the safety net -- display once at enrollment, store hashed (not plaintext). Require the user to acknowledge they have saved them. For account recovery without any second factor: require identity verification (support ticket with ID verification, time-delayed recovery with notification to all registered emails, or admin-assisted recovery). Never allow recovery to bypass MFA entirely -- that makes the recovery flow the weakest link.
6. **Implement step-up authentication.** For sensitive operations (changing email, changing password, authorizing payments, viewing sensitive data), require a fresh MFA challenge even if the session is already authenticated. This limits the damage of session hijacking: a stolen session cookie cannot change the account email without the second factor.
7. **Defend against MFA fatigue.** Rate-limit push notifications (max 3 per hour). Use number matching (display a number on the login screen, require the user to enter it in the authenticator app) instead of simple approve/deny. Log and alert on repeated denied MFA prompts.

**Details:**

- **WebAuthn/FIDO2/passkeys explained**: Resident credentials (passkeys) store the private key on the device. Non-resident credentials store an encrypted key handle on the server. Passkeys sync across devices via iCloud Keychain, Google Password Manager, or 1Password. Explain the registration ceremony (challenge, create credential, store public key) and authentication ceremony (challenge, get assertion, verify signature). Note: passkeys eliminate the need for passwords entirely -- they are not just a second factor but a replacement for the first factor.
- **TOTP vs HOTP**: TOTP (time-based) uses the current timestamp; HOTP (counter-based, RFC 4226) uses a monotonically increasing counter. TOTP is preferred because HOTP requires counter synchronization and can desync if the user generates codes without submitting them. TOTP codes expire after 30 seconds, limiting the replay window.
- **SMS as MFA -- risk analysis**: SS7 protocol vulnerabilities allow interception of SMS messages by any telecom operator or attacker with SS7 access. SIM swap attacks convince the carrier to transfer the phone number to a new SIM. NIST SP 800-63B deprecated SMS as a single-factor authenticator and restricted it as a second factor. If SMS must be offered, treat it as the weakest option and encourage migration to TOTP or WebAuthn.
- **Adaptive MFA**: Trigger MFA challenges based on risk signals: new device, new IP, new geographic location, high-value operation, anomalous login time. Low-risk logins (known device, usual location, usual time) may skip MFA to reduce friction while maintaining security for anomalous access patterns.

**Anti-Patterns:**

1. **SMS as the only MFA option.** SMS is vulnerable to SIM swap, SS7 interception, and real-time phishing. Always offer at least TOTP as an alternative. Prefer WebAuthn/passkeys as the primary option.
2. **Recovery flow that bypasses MFA.** If "forgot my authenticator" sends an email with a magic link that grants full access, then email is the real authentication factor and MFA provides no additional security. Recovery must be at least as strong as the factor it replaces.
3. **MFA fatigue through push spam.** Simple approve/deny push notifications can be overcome by sending dozens of prompts until the user approves one out of frustration. Use number matching, rate limiting, and anomaly detection on repeated denials.
4. **Storing TOTP secrets in plaintext.** The TOTP shared secret is equivalent to a password -- if the database is breached, the attacker can generate valid TOTP codes. Encrypt TOTP secrets at rest using a KMS-managed key.
5. **No backup authentication method.** If the user's only second factor is a single phone and they lose it, they are locked out. Require enrollment of at least two factors (e.g., TOTP app + backup codes, or hardware key + phone). Provide clear account recovery documentation at enrollment time.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-mfa-design knowledge skill`

---

### Task 5: security-authentication-flows

**Depends on:** none
**Files:** `agents/skills/claude-code/security-authentication-flows/SKILL.md`, `agents/skills/claude-code/security-authentication-flows/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-authentication-flows
version: '1.0.0'
description: Secure design of login, registration, password reset, magic link, and SSO authentication flows -- preventing account enumeration, credential theft, and session fixation
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
  - security-session-management
  - security-mfa-design
  - security-cryptographic-randomness
  - owasp-auth-patterns
  - owasp-csrf-protection
stack_signals: []
keywords:
  - login
  - registration
  - password reset
  - magic link
  - SSO
  - OAuth
  - OIDC
  - account enumeration
  - brute force
  - credential stuffing
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Authentication Flows`
**Tagline:** `> Login, registration, password reset, magic links, and SSO -- each flow has distinct attack surfaces and each must be hardened independently`

**When to Use:**

- Designing authentication for a new application from scratch
- Adding password reset, magic link, or SSO to an existing system
- Auditing existing authentication flows for enumeration, fixation, or brute-force vulnerabilities
- Integrating OAuth 2.0 / OIDC with an identity provider
- Implementing passwordless authentication

**Threat Context:**
Authentication flows are the primary target for credential stuffing (automated login attempts using breached credentials), account enumeration (determining valid usernames via differing error messages or response times), and session fixation (forcing a known session ID before authentication). The 2021 Facebook data scrape extracted 533 million phone numbers by exploiting the "forgot password" flow's account enumeration behavior. Password reset flows are frequently the weakest link: the 2012 Dropbox breach started with a reused password, but the 2016 disclosure was enabled by password reset token predictability.

**Instructions:**

1. **Login flow.** Return identical error messages for "user not found" and "wrong password" -- both should say "Invalid credentials." Enforce rate limiting per username and per IP (e.g., 5 failed attempts lock the account for 15 minutes, 20 failed attempts from one IP trigger a CAPTCHA). Issue a new session ID after successful login (prevents session fixation). Set session cookies with Secure, HttpOnly, SameSite=Lax flags.
2. **Registration flow.** Validate email ownership before account activation (send verification link). Use CSPRNG for the verification token (128+ bits). Set token expiration (24 hours). Prevent account enumeration: if the email already exists, still say "verification email sent" and send the existing user a "someone tried to register with your email" notification instead.
3. **Password reset flow.** Generate a CSPRNG token (128+ bits, single-use, expires in 1 hour). Send via email. On submission, invalidate the token immediately (single use). Do not reveal whether the email exists -- always say "If an account exists, we sent a reset link." Rate-limit reset requests per email (max 3 per hour). Require the current password OR MFA when changing a password from an authenticated session (prevents session-hijack-to-password-change).
4. **Magic link flow.** A passwordless flow: user enters email, receives a link with a CSPRNG token, clicks to authenticate. Security considerations: token must be single-use, short-lived (15 minutes max), and bound to the requesting IP or device fingerprint. Email is the authentication factor -- ensure email account security is adequate for your threat model. Magic links are vulnerable to email interception and forwarding.
5. **SSO / OAuth 2.0 / OIDC integration.** Use Authorization Code flow with PKCE (RFC 7636) for all clients, including server-side apps (PKCE prevents authorization code interception). Validate the `state` parameter to prevent CSRF. Validate the `nonce` in the ID token to prevent replay. Validate the token issuer (`iss`), audience (`aud`), and expiration (`exp`). Never use the Implicit flow -- it exposes tokens in URL fragments and browser history.
6. **Account lockout vs rate limiting.** Hard lockout (disable account after N failures) enables denial of service: an attacker can lock out any account by trying wrong passwords. Prefer progressive delays: 1st-5th failure instant, 6th-10th 30-second delay, 11th+ 5-minute delay and CAPTCHA. Combine with IP-based rate limiting and anomaly detection.

**Details:**

- **Account enumeration taxonomy**: Enumerate the ways applications leak account existence: different error messages for "user not found" vs "wrong password," timing differences in password hash comparison (hashing takes time, but returning immediately for non-existent users is faster), different HTTP status codes, different response body sizes. Defense: always hash a dummy password even when the user does not exist (constant time), return identical responses.
- **OAuth 2.0 / OIDC security checklist**: Validate `state`, validate `nonce`, use PKCE, verify `iss` and `aud`, verify token signature, check `exp` and `iat`, verify `redirect_uri` matches registration, store tokens securely (not in localStorage -- use httpOnly cookies or server-side sessions), implement token refresh with rotation.
- **Passwordless comparison**: Compare magic links, WebAuthn/passkeys, and email OTPs across: phishing resistance, user experience, email dependency, device dependency, account recovery complexity.
- **Session fixation prevention**: Explain the attack: attacker sets a known session ID in the victim's browser (via URL parameter, cookie injection, or subdomain cookie), victim logs in with that session ID, attacker now has an authenticated session. Defense: always regenerate the session ID on login, never accept session IDs from URL parameters.

**Anti-Patterns:**

1. **Different error messages for login failures.** "User not found" vs "Incorrect password" tells attackers which emails are registered. Always return "Invalid credentials" regardless of which part failed.
2. **Password reset tokens that are predictable.** Using sequential IDs, timestamps, or MD5(email) as reset tokens. Tokens must be 128+ bits of CSPRNG output. Predictable tokens allow account takeover.
3. **OAuth Implicit flow.** Tokens in URL fragments are logged by proxies, browser extensions, and referrer headers. Use Authorization Code with PKCE for all clients.
4. **Storing OAuth tokens in localStorage.** XSS can extract tokens from localStorage. Store tokens in httpOnly cookies or server-side sessions.
5. **No rate limiting on login or reset.** Without rate limiting, attackers can attempt millions of passwords (credential stuffing) or flood reset emails (email bombing). Rate limit by account, by IP, and globally.
6. **Account lockout without rate limiting.** Hard lockout (disable account after 5 failures) enables denial of service against any user. Use progressive delays and CAPTCHA instead.

7. Run: `harness validate`
8. Commit: `feat(skills): add security-authentication-flows knowledge skill`

---

### Task 6: security-abac-design

**Depends on:** none
**Files:** `agents/skills/claude-code/security-abac-design/SKILL.md`, `agents/skills/claude-code/security-abac-design/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-abac-design
version: '1.0.0'
description: Attribute-based access control -- policy engines, XACML concepts, attribute evaluation, and when ABAC is the right model over RBAC
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
  - security-rbac-design
  - security-rebac-design
  - security-capability-based-security
  - security-zero-trust-principles
  - owasp-auth-patterns
  - owasp-idor-prevention
stack_signals: []
keywords:
  - ABAC
  - attribute-based access control
  - policy engine
  - XACML
  - OPA
  - Cedar
  - policy as code
  - access control policy
  - authorization engine
  - contextual authorization
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Attribute-Based Access Control`
**Tagline:** `> Evaluate access decisions using attributes of the subject, resource, action, and environment -- eliminating role explosion by expressing authorization as policy rules over contextual data`

**When to Use:**

- Role explosion makes RBAC unmanageable (too many role combinations needed)
- Authorization decisions depend on resource attributes (classification level, owner, department, region)
- Access rules vary by context (time of day, device posture, geographic location, risk score)
- Compliance requires fine-grained, auditable access policies (healthcare, finance, government)
- Migrating from hardcoded if/else authorization to a policy engine
- Implementing data-level access control (row-level or field-level security)

**Threat Context:**
The complexity of authorization logic is itself a vulnerability surface. Hardcoded if/else authorization scattered across a codebase accumulates inconsistencies: one endpoint checks department, another does not; one checks classification level, another checks role name. The 2023 Microsoft Power Platform vulnerability exposed customer data because one API checked authentication but not the tenant attribute. ABAC centralizes policy evaluation, making it auditable and consistent. However, poorly designed ABAC policies can themselves become opaque -- a policy engine that no one understands is not more secure than ad-hoc code.

**Instructions:**

1. **Identify the four attribute categories.** Subject attributes: user ID, roles, department, clearance level, employment status. Resource attributes: owner, classification, creation date, department, sensitivity label. Action attributes: read, write, delete, approve, export. Environment attributes: time of day, IP address, device trust level, request risk score. Access decisions evaluate predicates over these four categories.
2. **Write policies as rules, not code.** Use a policy language or engine: OPA/Rego, Cedar (AWS), Casbin, or XACML. Policies should read like business rules. Example in pseudo-policy: `ALLOW action:read ON resource WHERE resource.classification <= subject.clearance AND resource.department == subject.department AND environment.time BETWEEN 09:00 AND 18:00`. Separating policy from code means policy changes do not require code deployments.
3. **Implement the PDP/PEP pattern.** The Policy Decision Point (PDP) evaluates requests against policies and returns allow/deny. The Policy Enforcement Point (PEP) intercepts requests and calls the PDP before allowing the operation. The Policy Information Point (PIP) provides attribute values the PDP needs (e.g., looking up the user's department from the directory). The Policy Administration Point (PAP) manages policy lifecycle (create, update, deploy, audit).
4. **Default deny.** If no policy explicitly allows the action, deny it. This is the fundamental safety property. Every access must be explicitly authorized by at least one matching policy. Compile-time verification (where the policy engine supports it) should prove that no resource is accidentally unprotected.
5. **Design for auditability.** Log every policy decision with the request attributes, the policies evaluated, and the result. This is critical for compliance (SOC2, HIPAA, GDPR) and for debugging authorization errors. The decision log should be machine-parseable for automated analysis.
6. **Test policies like code.** Write unit tests for policies: given these subject/resource/action/environment attributes, the decision should be allow/deny. Test boundary conditions: what happens when an attribute is missing? What happens when multiple policies conflict? Use the policy engine's built-in test framework (OPA has `opa test`, Cedar has `cedar validate`).

**Details:**

- **ABAC vs RBAC decision matrix**: RBAC is sufficient when access depends on who the user is (their role). ABAC is needed when access depends on what the resource is, when the access happens, where the user is, or how the resource is classified. The diagnostic: if you are encoding attributes into role names (`us-east-classified-editor`), you need ABAC.
- **Policy engine comparison**: Compare OPA/Rego (general-purpose, Kubernetes-native, Rego language), Cedar (AWS-designed, type-safe, fast evaluation, built for authorization), Casbin (library-based, supports multiple models, embedded in application), XACML (XML-based standard, heavy, mostly enterprise/government). Recommendation: Cedar for greenfield authorization, OPA for infrastructure policy, Casbin for quick integration in existing apps.
- **Worked example -- healthcare data access**: Subject: Dr. Smith (role: physician, department: cardiology, hospital: General). Resource: Patient record #1234 (department: cardiology, classification: PHI, treating_physician: Dr. Smith). Policy: ALLOW action:read ON PatientRecord WHERE subject.role == "physician" AND (resource.treating_physician == subject.id OR resource.department == subject.department) AND environment.network == "hospital_internal". Show how adding a time constraint or device trust check modifies the policy without code changes.
- **Performance considerations**: ABAC policy evaluation adds latency to every request. Mitigate with: policy compilation (pre-compile policies to decision tables), attribute caching (cache frequently accessed attributes with short TTLs), partial evaluation (pre-compute decisions for known attribute combinations), and co-locating the PDP with the PEP (sidecar pattern in Kubernetes).

**Anti-Patterns:**

1. **ABAC without centralized policy management.** Scattering attribute checks across the codebase (`if user.dept == resource.dept && user.clearance >= resource.level`) is just RBAC in disguise with extra complexity. ABAC requires a policy engine to centralize, audit, and test policies.
2. **Over-specifying policies.** Policies with 10 attribute conditions are hard to understand, test, and maintain. If a policy requires more than 4-5 conditions, consider decomposing it into composable sub-policies.
3. **Missing attribute validation.** If the PDP does not validate that attributes are well-formed and from a trusted source, an attacker who can manipulate attribute values (e.g., setting their own clearance level via an API) can bypass all policies. Attribute sources must be authoritative and tamper-proof.
4. **No fallback for missing attributes.** If a required attribute is unavailable (PIP is down, user record incomplete), the policy must default to deny, not silently skip the condition. Design policies to handle missing attributes explicitly.
5. **Policy drift from intent.** ABAC policies can diverge from business intent when modified incrementally without review. Treat policy changes with the same rigor as code changes: version control, code review, automated testing, staged rollout.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-abac-design knowledge skill`

---

### Task 7: security-rebac-design

**Depends on:** none
**Files:** `agents/skills/claude-code/security-rebac-design/SKILL.md`, `agents/skills/claude-code/security-rebac-design/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-rebac-design
version: '1.0.0'
description: Relationship-based access control using the Zanzibar model -- modeling authorization as a graph of relationships between subjects and resources
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
  - security-rbac-design
  - security-abac-design
  - security-capability-based-security
  - owasp-idor-prevention
  - owasp-auth-patterns
stack_signals: []
keywords:
  - ReBAC
  - relationship-based access control
  - Zanzibar
  - SpiceDB
  - OpenFGA
  - authorization graph
  - permission model
  - Google Zanzibar
  - tuple-based authorization
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Relationship-Based Access Control`
**Tagline:** `> Model authorization as a graph of relationships -- "User X is an editor of Document Y which belongs to Folder Z owned by Team W" -- enabling inherited permissions that follow resource hierarchies`

**When to Use:**

- Building a document management, file sharing, or collaborative editing system
- Resources have complex ownership hierarchies (org -> team -> project -> resource)
- Access depends on the relationship between the user and the specific resource, not just the user's global role
- You need to answer "who can access this document?" efficiently (permission listing)
- Google Docs-style sharing is a product requirement
- RBAC or ABAC cannot naturally express hierarchical resource ownership

**Threat Context:**
IDOR (Insecure Direct Object Reference) is the most common authorization vulnerability because most systems check "can this user type do this operation?" (role check) but not "does this user have a relationship to this specific resource?" (object-level check). The 2021 Parler data scrape exploited the absence of object-level authorization. Google designed Zanzibar specifically to solve this: every access check resolves relationships in a globally consistent graph, ensuring that revoking a team's access to a folder immediately revokes access to all documents in that folder for all team members.

**Instructions:**

1. **Model resources and relationships as a graph.** Define object types (user, team, org, document, folder, project) and relationship types (owner, editor, viewer, member, parent). Store relationships as tuples: `(object, relation, subject)`. Example: `(document:readme, editor, user:alice)`, `(folder:docs, parent, document:readme)`, `(team:engineering, member, user:alice)`.
2. **Define permission rules using relationship composition.** A user can view a document if they are a direct viewer, OR an editor (editors can view), OR a member of a team that has viewer access. Express this as: `document#viewer = document#viewer + document#editor + document#parent.folder#viewer`. This composition allows permissions to inherit through the resource hierarchy.
3. **Implement check, expand, and list APIs.** Check: "Can user:alice view document:readme?" (traverses the graph, returns boolean). Expand: "What relationships does user:alice have to document:readme?" (returns all matching relations). List: "Who can view document:readme?" (returns all subjects with the viewer permission). Check is the authorization gate; expand and list are for UX (showing sharing panels) and audit.
4. **Ensure consistency.** When a team is removed from a folder, all members of that team must immediately lose access to all documents in that folder. This requires transactional relationship updates and consistent graph traversal. Zanzibar uses a Zookie (opaque consistency token) to ensure reads reflect all prior writes. Open-source implementations (SpiceDB, OpenFGA) provide similar consistency guarantees.
5. **Design the schema before writing tuples.** Define the type system: which object types exist, which relations each type supports, and how permissions are computed from relations. This is the "schema" in SpiceDB or the "authorization model" in OpenFGA. Validate the schema against test scenarios before deploying.
6. **Integrate with your API layer.** Every API endpoint that accesses a resource must call the ReBAC check API before proceeding. The check call includes the subject (authenticated user), the resource (object being accessed), and the permission (operation being performed). If the check returns deny, return 403.

**Details:**

- **Google Zanzibar paper summary**: Published at USENIX ATC 2019. Processes >10 million authorization checks per second at Google. Key innovations: global consistency via Zookies, leopard indexing for reverse lookups (who can access X?), and namespace configuration for defining relationship schemas. The paper's tuple format `(namespace:object_id#relation@user:user_id)` became the de facto standard.
- **Open-source implementations**: SpiceDB (by AuthZed, gRPC API, schema language, watch API for changes), OpenFGA (by Auth0/Okta, HTTP API, JSON-based model, supports contextual tuples), Ory Keto (based on Zanzibar, gRPC/REST API). All three support the core Zanzibar model; SpiceDB has the most mature schema language and testing toolchain.
- **Worked example -- Google Docs-style sharing**: Model types: user, group, folder, document. Relations: folder#owner, folder#editor, folder#viewer, document#owner, document#editor, document#viewer, document#parent (to folder), group#member. Permission rule: `document#viewer = document#viewer + document#editor + document#owner + document#parent->folder#viewer`. Show how sharing a folder with a group propagates viewer access to all documents in the folder for all group members. Show revocation: removing the group from the folder immediately revokes access to all documents.
- **Performance and scaling**: ReBAC checks require graph traversal, which can be expensive for deep hierarchies. Mitigate with: depth limits on traversal, caching of intermediate results, pre-computation of frequently checked permissions, and sharding the relationship store by namespace.

**Anti-Patterns:**

1. **Implementing ReBAC by querying a relational database with recursive CTEs.** While technically possible, recursive SQL queries for graph traversal do not scale and cannot provide the consistency guarantees needed for authorization. Use a purpose-built ReBAC engine.
2. **No consistency guarantees.** If a relationship write (revoke access) is not immediately visible to subsequent checks, there is a window where a revoked user can still access the resource. Use consistency tokens or ensure linearizable reads.
3. **Over-flattening the hierarchy.** Storing direct permissions on every document (denormalization) instead of modeling the hierarchy. This makes revocation O(N) (update every document) instead of O(1) (remove the folder relationship). The whole point of ReBAC is hierarchical inheritance.
4. **No schema validation.** Writing ad-hoc tuples without a validated schema leads to inconsistent relationship types, orphaned tuples, and permission rules that do not match the actual data model. Validate the schema and write integration tests against it.
5. **Ignoring the "list" query.** Many ReBAC implementations focus on "check" (can user X access resource Y?) but neglect "list" (who can access resource Y? / what can user X access?). Both are needed: check for authorization gates, list for sharing UIs, audit logs, and compliance reporting.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-rebac-design knowledge skill`

---

### Task 8: security-capability-based-security

**Depends on:** none
**Files:** `agents/skills/claude-code/security-capability-based-security/SKILL.md`, `agents/skills/claude-code/security-capability-based-security/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-capability-based-security
version: '1.0.0'
description: Object capabilities vs ambient authority -- unforgeable tokens that grant specific rights, eliminating confused deputy attacks by construction
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
  - security-rbac-design
  - security-abac-design
  - security-rebac-design
  - security-zero-trust-principles
  - owasp-idor-prevention
stack_signals: []
keywords:
  - capability-based security
  - object capability
  - ocap
  - confused deputy
  - ambient authority
  - principle of least authority
  - POLA
  - unforgeable reference
  - capability token
  - Deno permissions
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Capability-Based Security`
**Tagline:** `> Replace ambient authority ("who are you?") with explicit capabilities ("what token do you hold?") -- eliminating confused deputy attacks by making every permission a transferable, revocable, unforgeable object`

**When to Use:**

- Designing a plugin or extension system where untrusted code runs with limited permissions
- Building a sandboxed execution environment (serverless functions, browser iframes, Deno)
- Preventing confused deputy attacks in service-to-service communication
- Implementing fine-grained, delegatable permissions that can be scoped and revoked
- Evaluating whether ambient authority (ACLs/RBAC) or capability-based models better fit your threat model
- Designing pre-signed URLs or capability URLs for resource sharing

**Threat Context:**
The confused deputy problem (first described by Norm Hardy in 1988) occurs when a privileged program is tricked into misusing its authority on behalf of an attacker. Classic example: a compiler service has write access to billing logs; an attacker passes a crafted filename that overwrites the billing log via the compiler's ambient authority. In ACL systems, the compiler's identity grants write access to the log, regardless of who asked. In capability systems, the compiler only has capabilities it was explicitly given -- no ambient authority to misuse. CSRF is a web-specific confused deputy: the browser's ambient cookie authority is exploited by cross-origin requests. Pre-signed URLs (S3, GCS) are real-world capabilities: unforgeable, time-limited, scoped to a specific action on a specific resource.

**Instructions:**

1. **Understand the core principle: authority follows the reference.** A capability is an unforgeable reference that both designates a resource and authorizes an action on it. Possessing the capability is sufficient to perform the action -- no additional identity check is needed. This contrasts with ACLs where the system asks "who are you?" and checks a permission list.
2. **Design capabilities as unforgeable tokens.** In software: a capability is an opaque token (CSPRNG-generated, signed, or a cryptographic reference) that grants specific rights. The holder can exercise the capability but cannot forge new capabilities or escalate the rights of existing ones. Examples: pre-signed S3 URLs (capability to upload/download a specific object for a limited time), Macaroons (Google's attenuatable bearer tokens), API tokens with embedded scopes.
3. **Apply the Principle of Least Authority (POLA).** When creating a new process, plugin, or service call, grant only the capabilities it needs -- nothing more. Do not pass global database access when the function only needs to read one table. Do not pass a write capability when read suffices. Capability systems make POLA natural because you explicitly construct and pass the set of capabilities.
4. **Support attenuation (reducing but not expanding rights).** A holder of a write capability should be able to derive a read-only capability from it and pass that to a less-trusted party. Attenuation is one-directional: you can narrow capabilities but never widen them. Macaroons implement this via caveats: each caveat further restricts the token.
5. **Implement revocation.** Capabilities can be revoked via: short expiration times (pre-signed URLs), a revocation list checked at the enforcement point, or caretaker pattern (an intermediary that can be disabled to block all delegated capabilities). Choose based on latency requirements and consistency constraints.
6. **Apply to real-world systems.** Deno's permission model is capability-based: `--allow-read=/tmp` grants the filesystem read capability scoped to `/tmp`. Browser iframes with `sandbox` attribute strip ambient capabilities. Docker `--cap-drop ALL --cap-add NET_BIND_SERVICE` is capability-based. Pre-signed URLs for S3/GCS/Azure Blob are capabilities. Design your systems to pass capabilities explicitly rather than relying on ambient identity.

**Details:**

- **Capability vs ACL comparison table**: Compare across: confused deputy resistance, delegation support, revocation model, audit complexity, integration with existing systems. ACLs are better for centralized policy management and compliance auditing. Capabilities are better for distributed systems, plugin sandboxing, and preventing privilege escalation.
- **Macaroons (Google, 2014)**: Explain how macaroons work -- a chain of HMAC-authenticated caveats. The root macaroon is issued by the resource server. Each caveat further restricts the token (add time limit, add IP restriction, add scope restriction). Any holder can add caveats but no one can remove them. Third-party caveats enable delegated authentication.
- **Capability URLs**: URLs like `https://app.com/share/a8f3c9d1e2b4` where the random token in the path is the capability. Knowing the URL grants access. Used by Google Docs ("anyone with the link"), Figma, Notion. Security considerations: URL logging by proxies and browsers, referrer header leakage, link sharing beyond intended recipients. Mitigate with short expiration, access logging, and the ability to revoke the link.
- **Object-capability model in programming languages**: E language (the original ocap language), Newspeak, and Wasm component model use object references as capabilities. In these languages, you cannot access any resource you do not have an explicit reference to -- no global variables, no ambient imports. This makes security analysis tractable because authority flows are visible in the code structure.

**Anti-Patterns:**

1. **Capabilities that cannot be revoked.** A capability with no expiration and no revocation mechanism is a permanent, transferable, irrevocable grant of authority. Always include either a short expiration or a revocation mechanism.
2. **Leaking capabilities through logs or URLs.** Pre-signed URLs and capability tokens in URL paths are logged by web servers, proxies, CDNs, and browser history. Use POST bodies or headers for capability transmission when possible. When URLs must be used, use short expiration times.
3. **Ambient authority disguised as capabilities.** An "API key" that grants access to all resources for a user is not a capability -- it is an identity credential with ambient authority. True capabilities are scoped to specific resources and specific actions.
4. **Forgeable capabilities.** A capability URL using sequential IDs (`/share/1234`) is trivially forgeable by incrementing. Capabilities must be unguessable: use 128+ bits of CSPRNG output or cryptographic signatures.
5. **All-or-nothing permissions.** A capability system that only offers "full access" and "no access" misses the point. Design capabilities with fine-grained scoping: read vs write, specific resource vs collection, time-limited vs permanent.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-capability-based-security knowledge skill`

---

### Task 9: security-microsegmentation

**Depends on:** none
**Files:** `agents/skills/claude-code/security-microsegmentation/SKILL.md`, `agents/skills/claude-code/security-microsegmentation/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-microsegmentation
version: '1.0.0'
description: Network and application-level segmentation -- isolating workloads so that compromising one service does not grant lateral movement to others
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
  - security-zero-trust-principles
  - security-identity-verification
  - security-trust-boundaries
  - security-mtls-design
  - owasp-security-headers
stack_signals: []
keywords:
  - microsegmentation
  - network segmentation
  - lateral movement
  - zero trust networking
  - service mesh
  - network policy
  - Kubernetes NetworkPolicy
  - firewall rules
  - east-west traffic
  - blast radius
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Microsegmentation`
**Tagline:** `> Isolate every workload behind its own perimeter -- so compromising the web server does not hand the attacker the database, the secrets store, and the internal APIs`

**When to Use:**

- Designing network architecture for a microservices system
- Implementing zero trust networking within a data center or cloud VPC
- Reducing blast radius after a service compromise
- Configuring Kubernetes NetworkPolicies or cloud security groups
- Auditing east-west traffic (service-to-service) for unauthorized communication
- Preparing for compliance frameworks that require network segmentation (PCI-DSS, HIPAA)

**Threat Context:**
Traditional perimeter security (firewall at the edge, flat network inside) fails catastrophically when the perimeter is breached. The 2013 Target breach started with compromised HVAC vendor credentials and used the flat internal network to reach the POS systems -- lateral movement across 40 million credit cards. The 2017 Equifax breach exploited a single web application vulnerability and pivoted through unscgmented internal systems to access 147 million records. Microsegmentation limits blast radius: if the web server is compromised, it can only reach the services it was explicitly allowed to communicate with. Everything else is unreachable.

**Instructions:**

1. **Map all service-to-service communication flows.** Before writing a single firewall rule, document which services talk to which services, on which ports, using which protocols. This is your baseline. Any communication not in this map should be denied by default. Use network flow logs, service mesh telemetry, or traffic analysis tools to discover actual traffic patterns.
2. **Apply default-deny network policies.** Start with "deny all ingress and egress" for every workload. Then add explicit allow rules for each documented communication flow. In Kubernetes: create a NetworkPolicy with `policyTypes: [Ingress, Egress]` and empty rules (deny-all), then add specific allow rules. In cloud: use security groups with deny-all and explicit allow rules.
3. **Segment by trust level, not just by service.** Group services into trust zones: public-facing (web servers, API gateways), application logic (business services), data stores (databases, caches), management (monitoring, logging, CI/CD). Apply stricter rules at zone boundaries. Data stores should only accept connections from application logic, never from public-facing services directly.
4. **Use service identity, not IP addresses.** IP-based rules are fragile in dynamic environments (containers, autoscaling, spot instances). Use service identity (mTLS certificates, SPIFFE IDs, Kubernetes service accounts) to define policies. Service mesh (Istio, Linkerd, Cilium) provides identity-based policy enforcement.
5. **Enforce application-layer segmentation.** Network segmentation (L3/L4) blocks unauthorized IP/port combinations but does not prevent an authorized connection from sending malicious requests. Add L7 policies: only allow specific HTTP methods and paths between services. Service mesh authorization policies enable this.
6. **Monitor and alert on policy violations.** Log denied connections. Alert on unexpected communication patterns. A sudden spike in denied traffic between two services may indicate a compromised service attempting lateral movement. Review flow logs periodically to discover new communication patterns that need policy updates.

**Details:**

- **Microsegmentation vs traditional VLANs**: VLANs segment at the network layer but every host within a VLAN can communicate freely. Microsegmentation applies per-workload policies, so two containers on the same host can be in different segments. VLANs are insufficient for containerized and cloud-native environments where workload density is high.
- **Implementation technologies**: Kubernetes NetworkPolicy (basic L3/L4, requires a CNI that supports it: Calico, Cilium, Antrea), Cilium network policies (L3/L4/L7, eBPF-based, identity-aware), Istio AuthorizationPolicy (L7, mTLS-based identity), AWS Security Groups (L3/L4, instance-level), Azure NSGs, GCP Firewall Rules. For Kubernetes, Cilium provides the richest policy model (L7 HTTP/gRPC policies, DNS-based egress policies).
- **PCI-DSS segmentation requirements**: PCI-DSS requires that the Cardholder Data Environment (CDE) is segmented from all other systems. Microsegmentation implements this by: placing CDE components in a dedicated segment, allowing only authorized services to communicate with the CDE, logging all CDE traffic, and testing segmentation controls annually.
- **Blast radius analysis**: For each service, enumerate what an attacker with full control of that service can reach. If compromising the web server gives access to the database, the secrets store, and the CI/CD system, the blast radius is the entire system. After segmentation, the web server should only reach the API gateway and the application services -- the database and secrets store are unreachable.

**Anti-Patterns:**

1. **Flat network with no internal segmentation.** All services can reach all other services. Compromising any single service grants access to the entire system. This is the default in most cloud VPCs and Kubernetes clusters and must be explicitly corrected.
2. **Overly permissive allow rules.** Rules like "allow all traffic from the application subnet to the data subnet" defeat the purpose of segmentation. Be specific: allow service-A to reach database-B on port 5432 using TCP.
3. **Segmentation without monitoring.** Policies without monitoring are unverifiable. If you cannot see what traffic is flowing and what is being denied, you cannot know if the segmentation is effective or if rules have drifted.
4. **IP-based policies in dynamic environments.** Kubernetes pods get new IPs on every restart. Security group rules referencing specific IPs become stale immediately. Use service identity and label selectors instead.
5. **Segmentation only at the network layer.** L3/L4 policies prevent unauthorized connections but do not prevent authorized connections from being misused. Add L7 policies for sensitive services (e.g., only allow GET and POST on specific paths, reject DELETE).

6. Run: `harness validate`
7. Commit: `feat(skills): add security-microsegmentation knowledge skill`

---

### Task 10: security-identity-verification

**Depends on:** none
**Files:** `agents/skills/claude-code/security-identity-verification/SKILL.md`, `agents/skills/claude-code/security-identity-verification/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-identity-verification
version: '1.0.0'
description: Continuous authentication and device trust -- verifying identity beyond the initial login using behavioral signals, device posture, and risk-adaptive challenges
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
  - security-zero-trust-principles
  - security-microsegmentation
  - security-mfa-design
  - security-session-management
  - owasp-auth-patterns
stack_signals: []
keywords:
  - continuous authentication
  - device trust
  - device posture
  - risk-based authentication
  - adaptive authentication
  - BeyondCorp
  - zero trust identity
  - device attestation
  - session risk scoring
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Continuous Identity Verification`
**Tagline:** `> Authentication at login is necessary but insufficient -- continuously evaluate identity confidence using device trust, behavioral signals, and environmental context throughout the session`

**When to Use:**

- Implementing zero trust architecture that requires continuous verification
- Designing device trust policies (MDM enrollment, OS version, encryption status)
- Building risk-adaptive authentication that adjusts challenge level based on context
- Replacing VPN-based network access with identity-aware access proxies
- Evaluating Google BeyondCorp or similar zero trust access models
- Adding session risk scoring to detect account takeover mid-session

**Threat Context:**
Traditional authentication verifies identity once at login and trusts the session for its entire lifetime. Session hijacking (stolen cookies, XSS-extracted tokens), credential compromise discovered mid-session, and device compromise after login all exploit this one-time-check model. Google's BeyondCorp (deployed internally after the 2009 Operation Aurora attack by Chinese state hackers) eliminated the trusted network perimeter and replaced it with continuous per-request identity and device verification. The 2022 Uber breach demonstrated that initial authentication (even with MFA) is insufficient when session tokens are subsequently stolen via social engineering.

**Instructions:**

1. **Evaluate device trust posture before granting access.** Collect device signals: OS version (is it patched?), disk encryption status, screen lock enabled, MDM enrollment status, firewall enabled, antivirus status. Define a minimum device posture profile for each access level: accessing public docs requires basic posture; accessing production systems requires fully managed, encrypted devices with current patches.
2. **Implement risk-based session scoring.** Assign a risk score to each session based on signals: IP geolocation change, impossible travel (login from New York and London within 30 minutes), new device, new browser, unusual time of day, high-velocity actions (100 API calls per minute from a normally low-volume user). When the risk score exceeds a threshold, trigger step-up authentication (re-enter password, MFA challenge) or terminate the session.
3. **Use identity-aware access proxies.** Replace VPN with a reverse proxy that evaluates identity, device posture, and access policy on every request. Google BeyondCorp, Cloudflare Access, Zscaler Private Access, and Palo Alto Prisma Access implement this model. The proxy intercepts every request, validates the user's identity (via session token), checks device posture (via client certificate or agent attestation), and evaluates the access policy before forwarding the request to the backend.
4. **Implement device attestation.** Use client certificates (issued by your CA, bound to the device's TPM) or device attestation protocols (Apple DeviceCheck, Android SafetyNet/Play Integrity, Windows Device Health Attestation) to cryptographically verify that the device meets your posture requirements. Self-reported device attributes are insufficient -- they can be spoofed.
5. **Define access tiers by sensitivity.** Not all resources need the same level of identity assurance. Tier 1 (public docs): authenticated user, any device. Tier 2 (internal tools): authenticated user, managed device, current patches. Tier 3 (production access, financial data): authenticated user, managed device, MFA within last hour, device attestation, trusted network or VPN.
6. **Handle degradation gracefully.** When device posture degrades mid-session (e.g., MDM detects the device is rooted or a required certificate expires), the system should reduce access level, not crash. Downgrade from Tier 3 to Tier 1 and notify the user that additional verification is needed to regain full access.

**Details:**

- **Google BeyondCorp architecture**: Explain the four components: device inventory (tracks all devices and their trust level), access control engine (evaluates policies per request), access proxy (intercepts all traffic), and single sign-on (authenticates users). Show how a request flows: user -> access proxy -> SSO check -> device trust check -> policy evaluation -> backend service. No VPN, no trusted network, every request is individually authorized.
- **Risk signals taxonomy**: Enumerate risk signals: authentication age (time since last MFA), device change, IP reputation, geolocation anomaly, impossible travel, behavioral anomaly (unusual API calls, unusual data volume), concurrent sessions from different locations, session token age. Show how to combine signals into a composite risk score.
- **FIDO2/WebAuthn for continuous auth**: WebAuthn can be used not just at login but for continuous re-authentication. Silent authentication using a platform authenticator (Touch ID, Windows Hello) provides a low-friction re-verification that confirms the user is still physically present. This is stronger than session timeout-based re-authentication.
- **Implementation with identity proxies**: Compare Cloudflare Access (cloud-only, simple setup, limited device posture checks), Teleport (open source, supports SSH/Kubernetes/database access, strong device trust), Boundary (HashiCorp, session-based access, credential brokering), and Pomerium (open source, identity-aware proxy, supports device posture via mTLS).

**Anti-Patterns:**

1. **Authenticate once, trust forever.** A session that is valid for 30 days without re-verification gives an attacker 30 days to exploit a stolen session token. Implement session risk scoring and periodic re-authentication, especially for sensitive operations.
2. **Self-reported device posture.** Trusting the client to report its own OS version, encryption status, or MDM enrollment without cryptographic attestation. An attacker can spoof any self-reported attribute. Require device attestation via TPM-bound certificates or platform attestation APIs.
3. **VPN as the zero trust solution.** VPN authenticates at connection time and then grants full network access to the internal network. This is perimeter security, not zero trust. Replace VPN with identity-aware proxies that evaluate policy per-request.
4. **Binary access decisions.** Either full access or no access, with no intermediate states. Implement tiered access that degrades gracefully based on trust level: high trust = full access, medium trust = read-only, low trust = blocked.
5. **No visibility into device fleet.** If you do not know how many devices access your systems, their OS versions, or their security posture, you cannot enforce device trust policies. Implement device inventory and posture collection as a prerequisite to continuous verification.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-identity-verification knowledge skill`

---

[checkpoint:human-verify] -- Verify that Tasks 1-10 are complete and correct before continuing with Tasks 11-20.

---

### Task 11: security-vault-patterns

**Depends on:** none
**Files:** `agents/skills/claude-code/security-vault-patterns/SKILL.md`, `agents/skills/claude-code/security-vault-patterns/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-vault-patterns
version: '1.0.0'
description: Centralized secrets management using vault systems -- HashiCorp Vault, cloud KMS, sealed secrets, dynamic credentials, and the principle of secrets as cattle not pets
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
  - security-secrets-lifecycle
  - security-environment-variable-risks
  - security-credential-storage
  - owasp-secrets-management
stack_signals: []
keywords:
  - vault
  - HashiCorp Vault
  - secrets management
  - KMS
  - key management
  - sealed secrets
  - dynamic credentials
  - secret engine
  - transit encryption
  - envelope encryption
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Vault Patterns`
**Tagline:** `> Centralize secrets in a vault, issue dynamic short-lived credentials, encrypt data through a transit engine, and eliminate long-lived secrets from your infrastructure`

**When to Use:**

- Centralizing secrets management across multiple services and environments
- Replacing long-lived database credentials with dynamic, short-lived ones
- Implementing envelope encryption for data at rest
- Managing TLS certificates and PKI infrastructure
- Designing secrets access patterns for Kubernetes workloads
- Evaluating HashiCorp Vault vs cloud-native KMS (AWS KMS, GCP KMS, Azure Key Vault)

**Threat Context:**
Static, long-lived credentials are the most exploited vulnerability in cloud environments. The 2019 Capital One breach used stolen IAM credentials that had overly broad access and never rotated. AWS reports that exposed access keys are exploited within minutes of being pushed to public repositories (automated bots scan GitHub continuously). Dynamic credentials that expire in minutes instead of lasting forever reduce the attack window from "indefinitely" to "minutes." Vault systems also provide audit trails for every secret access, enabling detection of unauthorized access patterns.

**Instructions:**

1. **Choose the right vault architecture.** HashiCorp Vault: self-hosted or HCP Vault (managed), richest feature set, steepest learning curve. AWS Secrets Manager + KMS: cloud-native, simple, integrated with IAM. GCP Secret Manager + Cloud KMS: similar to AWS. Azure Key Vault: similar to AWS. Sealed Secrets (Bitnami): Kubernetes-specific, encrypts secrets for GitOps. For multi-cloud or on-premise: HashiCorp Vault. For single-cloud: use the native secrets manager.
2. **Use dynamic secrets instead of static credentials.** Vault's database secret engine generates unique database credentials per request with configurable TTL (e.g., 1 hour). When the TTL expires, the credentials are automatically revoked. If a credential is compromised, the blast radius is limited to that credential's TTL. No more shared database passwords in config files.
3. **Implement envelope encryption for data at rest.** Do not store the data encryption key (DEK) alongside the data. Encrypt the DEK with a key encryption key (KEK) managed by the vault's transit engine or KMS. Store the encrypted DEK with the data. To decrypt: send the encrypted DEK to the vault, get back the plaintext DEK, decrypt the data locally. This means the vault never sees your data -- it only manages keys.
4. **Authenticate workloads to the vault.** Kubernetes: use the Kubernetes auth method (service account token authentication). AWS: use the IAM auth method (instance profile or IAM role). AppRole: for CI/CD and automated systems (role ID + secret ID). Never hardcode vault tokens. Every workload authenticates with the identity it already has (Kubernetes service account, AWS IAM role, etc.).
5. **Implement PKI and certificate management.** Vault's PKI secret engine acts as a certificate authority. Issue short-lived TLS certificates (24-72 hours) to services. Short-lived certificates eliminate the need for revocation lists (CRLs) because they expire before an attacker can meaningfully exploit a compromised certificate. Automate certificate issuance and renewal via cert-manager (Kubernetes) or Vault Agent.
6. **Seal and unseal operations.** HashiCorp Vault uses a seal mechanism: the master key is split into shares (Shamir's Secret Sharing). A threshold of shares (e.g., 3 of 5) is required to unseal the vault. In production, use auto-unseal with a cloud KMS (the KMS key unseals the vault master key). This eliminates the need for human operators to provide key shares during restarts.

**Details:**

- **Dynamic secrets deep dive**: Show the lifecycle: application authenticates to Vault -> requests database credentials -> Vault creates a unique database user with the required grants and a 1-hour TTL -> Vault returns the credentials -> application uses them -> TTL expires -> Vault revokes the user. Compare this to static credentials: created once, shared across services, never expire, never rotated, compromise is permanent.
- **Transit engine for application-level encryption**: The transit engine performs encrypt/decrypt operations without exposing the key. API: `POST /transit/encrypt/my-key` with plaintext data, returns ciphertext. `POST /transit/decrypt/my-key` with ciphertext, returns plaintext. Key rotation is transparent: new versions of the key are created, old ciphertexts can still be decrypted, re-encryption can be done in batches.
- **Vault in Kubernetes**: Vault Agent injector (sidecar that fetches secrets and writes them to shared volumes), CSI driver (mounts secrets as files), External Secrets Operator (syncs vault secrets to Kubernetes Secrets). Recommend: Vault Agent for workloads that need dynamic secrets, External Secrets Operator for simpler static secret sync.
- **Disaster recovery**: Vault contains all your secrets -- losing it is catastrophic. Implement: regular snapshots, cross-region replication, DR cluster (HashiCorp Vault Enterprise), and tested restore procedures. Test recovery quarterly.

**Anti-Patterns:**

1. **Vault with a single unseal key.** If one person has the unseal key and they are unavailable, no one can unseal the vault. Use Shamir's Secret Sharing with a 3-of-5 (or similar) threshold, or auto-unseal with a cloud KMS.
2. **Long-lived vault tokens.** Vault tokens with no TTL or very long TTLs defeat the purpose of centralized secrets management. Use short-lived tokens (1-24 hours) with renewal, and configure max TTLs on token roles.
3. **Vault as a dumb key-value store.** Using Vault only to store static secrets misses its most powerful feature: dynamic secrets. If you are storing a database password in Vault and sharing it across services, you have only centralized the static credential -- you have not eliminated it.
4. **No audit logging.** Vault has a built-in audit device that logs every operation. Failing to enable it means you cannot detect unauthorized secret access, compromised tokens, or policy violations. Enable audit logging to at least one persistent backend.
5. **Skipping seal/unseal understanding.** Deploying Vault without understanding the seal mechanism leads to outages when the vault is sealed (due to restart, crash, or manual seal) and no one knows how to unseal it.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-vault-patterns knowledge skill`

---

### Task 12: security-environment-variable-risks

**Depends on:** none
**Files:** `agents/skills/claude-code/security-environment-variable-risks/SKILL.md`, `agents/skills/claude-code/security-environment-variable-risks/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-environment-variable-risks
version: '1.0.0'
description: Why environment variables leak secrets and safer alternatives -- process listings, crash dumps, child processes, logging, and the 12-factor app's blind spot
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
  - security-secrets-lifecycle
  - security-vault-patterns
  - owasp-secrets-management
stack_signals: []
keywords:
  - environment variables
  - env vars
  - secrets leakage
  - 12-factor app
  - process environment
  - /proc/environ
  - dotenv
  - secrets in config
  - secret injection
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Environment Variable Risks`
**Tagline:** `> Environment variables are visible in process listings, inherited by child processes, captured in crash dumps, and logged by every debugging tool -- they are the worst place to store secrets`

**When to Use:**

- Evaluating how to pass secrets to applications at runtime
- Auditing existing applications that use environment variables for secrets
- Designing a safer alternative to `.env` files and environment variable injection
- Understanding why secrets leak in CI/CD pipelines and container orchestrators
- Migrating from env-var-based secrets to a vault or mounted-file approach

**Threat Context:**
The 12-factor app methodology (2011) recommended environment variables for configuration, including secrets. This advice was reasonable for its time but has aged poorly. Environment variables are exposed in: `/proc/<pid>/environ` on Linux (readable by same-user processes), `docker inspect` output, Kubernetes pod descriptions (`kubectl describe pod`), CI/CD build logs (many CI systems log env vars by default or on error), crash dumps and core files, error reporting services (Sentry, Datadog, etc. capture environment), child processes (env vars are inherited by all child processes, including those you did not write). The 2021 Codecov supply chain attack exfiltrated secrets by reading environment variables from CI/CD pipelines.

**Instructions:**

1. **Understand the leakage surface.** Environment variables are: visible to any process running as the same user via `/proc/<pid>/environ`, inherited by all child processes and subshells, captured in core dumps, logged by many frameworks in debug mode, exposed in container inspection commands, and often included in error reports sent to third-party services.
2. **Prefer mounted files over environment variables.** Instead of `DATABASE_URL=postgres://user:pass@host/db`, mount a file at `/var/secrets/database-url` and read it at startup. Files can have restricted permissions (0400, owned by the application user), are not inherited by child processes, do not appear in process listings, and are not captured in crash dumps. Kubernetes Secrets can be mounted as files. Vault Agent writes secrets to files in a tmpfs mount.
3. **If you must use env vars, limit exposure.** Read the env var once at startup, store it in application memory, and unset the env var immediately (`delete process.env.DATABASE_URL`). This limits the window during which the secret is visible in `/proc/environ`. However, this does not prevent inheritance by child processes started during the window.
4. **Audit CI/CD for env var logging.** Many CI systems (GitHub Actions, GitLab CI, CircleCI) mask secrets in logs but only if the secrets are registered as secret variables. Unregistered env vars containing secrets are logged in plaintext. Audit all env vars in CI/CD for secrets that should be registered as masked/secret variables. Use CI secret scanning (e.g., gitleaks, truffleHog) on CI logs.
5. **Use runtime secret injection.** Instead of setting env vars in Dockerfiles or docker-compose files (which bakes them into images or version-controlled files), inject secrets at runtime via: Kubernetes Secrets mounted as files, Vault Agent sidecar, cloud provider secret injection (AWS Secrets Manager + ECS, GCP Secret Manager + Cloud Run), or init containers that fetch secrets and write them to shared volumes.
6. **Never put secrets in Dockerfiles or docker-compose.yml.** `ENV DATABASE_PASSWORD=hunter2` in a Dockerfile bakes the secret into every image layer. Docker layer caching means the secret persists even if you delete it in a later layer. Use multi-stage builds with `--secret` flag or runtime injection.

**Details:**

- **Leakage vector inventory**: Exhaustive list: `/proc/<pid>/environ`, `ps e` command, `docker inspect`, `kubectl describe pod`, `heroku config`, CI/CD build logs, crash dumps/core files, error reporting services (Sentry/Bugsnag/Datadog), child process inheritance, shell history (if secrets are set via command line), `.env` files committed to git, Docker image layers, Terraform state files.
- **Safer alternatives comparison**: Compare env vars, mounted files, Vault Agent injection, Kubernetes CSI Secret Store, SOPS-encrypted files, and runtime API fetch across: leakage risk, operational complexity, secret rotation support, and audit trail.
- **The Codecov attack case study**: In 2021, Codecov's Bash Uploader script was modified to exfiltrate environment variables (including CI tokens, API keys, and credentials) from thousands of CI/CD pipelines. The attack worked because CI pipelines routinely have dozens of secrets in environment variables, and any script with process access can read them all.
- **12-factor app reinterpretation**: The 12-factor app's "store config in environment" principle was about separating config from code, not about security. The spirit of the principle (externalize configuration) can be achieved more securely with mounted files, secret managers, or runtime injection. The letter of the principle (use env vars specifically) has known security limitations.

**Anti-Patterns:**

1. **`.env` files committed to version control.** Even with `.gitignore`, `.env` files end up in git history through mistakes. Once committed, the secrets are in every clone forever. Use `.env.example` with placeholder values; actual `.env` files must never be committed.
2. **Secrets in Docker Compose files.** `docker-compose.yml` is version-controlled. Secrets in it are secrets in git. Use `docker-compose.yml` with `env_file` pointing to a file not in version control, or use Docker secrets.
3. **CI/CD secrets as unmasked env vars.** If a CI secret is not registered as a masked variable, any `printenv` or debug log step exposes it in plaintext build logs. Audit all CI/CD env vars and register secrets as masked/secret variables.
4. **Trusting `unset` to remove secrets.** Unsetting an env var removes it from the process environment but does not scrub it from memory (the string may persist in the heap). It also does not affect child processes that already inherited the variable.
5. **Using the same env var across all environments.** `DATABASE_URL` set to the production database URL in development environments means a development machine compromise leaks production credentials. Use environment-specific secret injection with separate credentials per environment.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-environment-variable-risks knowledge skill`

---

### Task 13: security-certificate-management

**Depends on:** none
**Files:** `agents/skills/claude-code/security-certificate-management/SKILL.md`, `agents/skills/claude-code/security-certificate-management/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-certificate-management
version: '1.0.0'
description: CA hierarchy, certificate pinning, Certificate Transparency, ACME/Let's Encrypt, and the lifecycle of X.509 certificates from issuance to revocation
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
  - security-tls-fundamentals
  - security-hsts-preloading
  - security-mtls-design
  - security-asymmetric-encryption
  - owasp-cryptography
stack_signals: []
keywords:
  - certificate
  - CA
  - certificate authority
  - X.509
  - certificate transparency
  - CT logs
  - ACME
  - Let's Encrypt
  - certificate pinning
  - certificate revocation
  - CRL
  - OCSP
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Certificate Management`
**Tagline:** `> X.509 certificates are the backbone of internet trust -- manage them correctly or accept that attackers can impersonate any service, intercept any connection, and forge any identity`

**When to Use:**

- Setting up TLS for a new service or domain
- Automating certificate issuance and renewal with ACME/Let's Encrypt
- Designing an internal PKI for service-to-service mTLS
- Evaluating certificate pinning for mobile applications
- Monitoring Certificate Transparency logs for unauthorized certificates
- Handling certificate revocation (CRL vs OCSP vs short-lived certs)

**Threat Context:**
Compromised or mis-issued certificates enable MITM attacks at scale. The 2011 DigiNotar breach resulted in fraudulent certificates for \*.google.com, used by the Iranian government to intercept Gmail traffic for 300,000 users. The 2015 CNNIC incident involved an intermediate CA issuing unauthorized certificates for Google domains. Certificate Transparency (CT) was created in response to detect mis-issuance. Expired certificates cause outages: the 2020 Microsoft Teams outage and 2018 Ericsson LTE outage (affecting 32 million users) were both caused by expired certificates that no one was monitoring.

**Instructions:**

1. **Understand the CA hierarchy.** Root CAs (self-signed, stored in browser/OS trust stores) sign intermediate CA certificates, which sign end-entity (leaf) certificates. Best practice: keep root CAs offline (air-gapped). Use intermediate CAs for day-to-day issuance. If an intermediate CA is compromised, revoke it without replacing the root.
2. **Automate with ACME.** Use Let's Encrypt (free, automated) for public-facing TLS. ACME protocol: the client proves domain control (HTTP-01 challenge: serve a file at `/.well-known/acme-challenge/`, DNS-01 challenge: create a TXT record, TLS-ALPN-01: respond during TLS handshake). Use certbot, cert-manager (Kubernetes), or acme.sh. Automate renewal: Let's Encrypt certificates expire in 90 days; set renewal at 60 days.
3. **Monitor Certificate Transparency logs.** CT logs record all publicly issued certificates. Monitor CT logs for your domains to detect unauthorized certificate issuance. Tools: crt.sh (manual search), Facebook CT Monitor, Cert Spotter, SSLMate. Set up alerts for any new certificate issued for your domains that you did not request.
4. **Handle revocation correctly.** CRL (Certificate Revocation List): a signed list of revoked serial numbers, downloaded periodically by clients. Slow to propagate, can be stale. OCSP (Online Certificate Status Protocol): real-time check of certificate status. OCSP stapling: the server includes a signed OCSP response in the TLS handshake, eliminating the client's need to contact the OCSP responder. Best practice: use OCSP stapling and short-lived certificates (short enough that revocation is unnecessary -- if the cert lives for 24 hours, revocation is not needed).
5. **Design internal PKI for mTLS.** For service-to-service authentication, run an internal CA (Vault PKI, cfssl, step-ca). Issue short-lived certificates (24-72 hours) to services. Short-lived certificates eliminate the need for revocation infrastructure. Use SPIFFE (Secure Production Identity Framework for Everyone) for service identity standards.
6. **Certificate pinning (mobile apps).** Pin the leaf certificate or the public key in mobile apps to prevent MITM via compromised CAs. Include backup pins for rotation. Pin the intermediate CA key (not the leaf) if you want to rotate leaf certificates without app updates. Be cautious: incorrect pinning causes app-breaking outages. Include an escape hatch (HTTP header pinning with `report-uri`, certificate expiration fallback).

**Details:**

- **X.509 certificate anatomy**: Subject (CN, O, OU), Issuer, Serial Number, Validity Period (Not Before / Not After), Public Key, Signature Algorithm, Extensions (Subject Alternative Names, Key Usage, Basic Constraints, Certificate Policies, CRL Distribution Points, Authority Information Access). SAN (Subject Alternative Name) is how multiple domains are covered by one certificate.
- **ACME protocol deep dive**: Show the flow: client -> new order -> authorization challenges -> prove domain control -> finalize order -> download certificate. Explain wildcard certificates (require DNS-01 challenge). Rate limits: Let's Encrypt allows 50 certificates per registered domain per week.
- **Certificate lifecycle**: Request -> Issuance -> Deployment -> Monitoring -> Renewal -> Revocation (if needed). The most common failure: forgetting to renew, causing an outage. The second most common failure: deploying with an incomplete certificate chain (missing intermediate CA certificates).
- **Short-lived certificates as revocation replacement**: If a certificate lives for 24 hours, the maximum exposure window for a compromised certificate is 24 hours. Contrast with a 1-year certificate: the compromised certificate is valid for up to 1 year unless revocation works perfectly (it rarely does -- CRL checking is best-effort in most clients).

**Anti-Patterns:**

1. **Self-signed certificates in production.** Self-signed certificates disable the CA trust chain and train users/developers to ignore certificate warnings. Use Let's Encrypt (free, automated) for public services. Use an internal CA for internal services.
2. **Manual certificate renewal.** Certificates that require human intervention for renewal will expire and cause outages. Automate renewal with ACME, cert-manager, or Vault PKI.
3. **Incomplete certificate chains.** Deploying a leaf certificate without including the intermediate CA certificates. Some clients have the intermediate cached; others do not. The result is sporadic TLS failures. Always deploy the full chain: leaf + intermediates (not the root).
4. **Certificate pinning without rotation plan.** Pinning a leaf certificate in a mobile app means you cannot rotate the certificate without an app update. Pin the intermediate CA public key instead, or include backup pins. Never deploy pinning without a tested rotation procedure.
5. **Ignoring Certificate Transparency.** If you are not monitoring CT logs for your domains, you will not know if a rogue CA or compromised intermediate issues a certificate for your domain until users are phished.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-certificate-management knowledge skill`

---

### Task 14: security-hsts-preloading

**Depends on:** none
**Files:** `agents/skills/claude-code/security-hsts-preloading/SKILL.md`, `agents/skills/claude-code/security-hsts-preloading/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-hsts-preloading
version: '1.0.0'
description: HTTP Strict Transport Security and preload lists -- eliminating the first-request HTTP downgrade window and ensuring browsers never connect over plaintext
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
  - security-tls-fundamentals
  - security-certificate-management
  - security-mtls-design
  - owasp-security-headers
stack_signals: []
keywords:
  - HSTS
  - HTTP Strict Transport Security
  - preload
  - SSL stripping
  - HTTPS redirect
  - max-age
  - includeSubDomains
  - transport security
  - downgrade attack
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# HSTS and Preloading`
**Tagline:** `> Tell the browser "never connect to this domain over HTTP, ever" -- and make it permanent by embedding the directive in every browser's shipped preload list`

**When to Use:**

- Deploying HTTPS for a new domain and need to prevent HTTP downgrade attacks
- Configuring security headers for production web applications
- Evaluating whether to submit a domain to the HSTS preload list
- Auditing existing HSTS configuration for correctness
- Understanding SSL stripping attacks and how HSTS prevents them

**Threat Context:**
SSL stripping attacks (first demonstrated by Moxie Marlinspike at Black Hat 2009) intercept the initial HTTP request before the redirect to HTTPS and maintain a plaintext connection with the victim while establishing HTTPS with the server. The attacker proxies all traffic, rewriting HTTPS links to HTTP. The victim sees a working website with no browser warning because the connection was never upgraded to HTTPS. HSTS eliminates this by telling the browser to never attempt HTTP for the domain after the first successful HTTPS visit. HSTS preloading eliminates even the first-visit vulnerability by shipping the directive in the browser itself.

**Instructions:**

1. **Set the HSTS header on all HTTPS responses.** `Strict-Transport-Security: max-age=31536000; includeSubDomains`. `max-age=31536000` means the browser will remember the HSTS directive for 1 year (in seconds). `includeSubDomains` applies the directive to all subdomains. After receiving this header over HTTPS, the browser will refuse to connect to the domain over HTTP for the specified duration.
2. **Redirect HTTP to HTTPS first.** HSTS only works if the browser receives it over HTTPS. Set up an HTTP -> HTTPS 301 redirect on all HTTP endpoints. The HSTS header must be sent on the HTTPS response (it is ignored on HTTP responses by spec).
3. **Ramp up max-age gradually.** Start with a short max-age (5 minutes = 300 seconds) while testing. Verify no mixed content issues or broken subdomains. Increase to 1 week (604800), then 1 month (2592000), then 1 year (31536000). If HSTS is deployed with a 1-year max-age and HTTPS breaks, the domain is inaccessible for up to 1 year for users who cached the directive.
4. **Submit to the HSTS preload list.** Once max-age is at least 1 year, `includeSubDomains` is set, and a `preload` directive is added (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`), submit the domain at hstspreload.org. Once accepted, every Chrome, Firefox, Safari, and Edge browser will ship with the directive baked in. The first-visit vulnerability is eliminated.
5. **Ensure all subdomains support HTTPS before adding `includeSubDomains`.** If any subdomain serves HTTP-only content, `includeSubDomains` will break it. Audit all subdomains (including development, staging, internal tools, legacy systems) before enabling `includeSubDomains`.
6. **Understand preload list removal is slow.** Removing a domain from the preload list requires: removing the `preload` directive from the header, submitting a removal request, waiting for browser vendors to process it (weeks to months), and then waiting for all users to update their browsers. This is intentional -- preloading is a commitment.

**Details:**

- **SSL stripping attack flow**: Victim connects to `http://bank.com` -> Attacker intercepts -> Attacker connects to `https://bank.com` -> Attacker proxies traffic, rewriting `https://` links to `http://` in all responses -> Victim sees a working bank website over HTTP -> Attacker captures all credentials and session tokens in plaintext. HSTS defeats this because the browser knows to never connect over HTTP.
- **HSTS preload list mechanics**: The list is maintained as a JSON file in the Chromium source code. Other browsers (Firefox, Safari, Edge) consume it. Submission requires: the `preload` directive, `includeSubDomains`, max-age >= 31536000, valid HTTPS on the apex domain and all subdomains. The list is checked at browser build time, not at runtime.
- **Common deployment mistakes**: Mixed content (loading images or scripts over HTTP from an HTTPS page), redirect loops (HTTP redirects to HTTPS redirects to HTTP), subdomains without HTTPS, HSTS header sent on HTTP responses (ignored by spec, sometimes confusing).
- **Interaction with other headers**: HSTS works with Content-Security-Policy `upgrade-insecure-requests` (automatically rewrites HTTP sub-resource URLs to HTTPS), and with `Referrer-Policy` (HTTPS-to-HTTP transitions strip the referrer, which HSTS prevents by ensuring all connections are HTTPS).

**Anti-Patterns:**

1. **HSTS without testing subdomains.** Enabling `includeSubDomains` when `legacy.example.com` only serves HTTP breaks that subdomain for the HSTS max-age duration. Audit all subdomains first.
2. **max-age of 0 in production.** `max-age=0` disables HSTS. If an attacker can force the browser to receive this header (via MITM on the first request), HSTS protection is removed. Never set max-age to 0 in production.
3. **Preloading before readiness.** Submitting to the preload list before all subdomains support HTTPS, before the team understands the commitment, or before testing with a long max-age. Preload removal takes months. Treat it as irreversible.
4. **HSTS on HTTP responses.** The `Strict-Transport-Security` header on an HTTP response is ignored per RFC 6797. Attackers could inject this header on an HTTP response to DoS a domain by setting `max-age=31536000` for a domain that does not support HTTPS. Browsers correctly ignore it on HTTP.
5. **Relying only on redirects.** HTTP-to-HTTPS redirects alone do not prevent SSL stripping. The first request is still HTTP and interceptable. HSTS ensures subsequent requests are HTTPS. Preloading ensures even the first request is HTTPS.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-hsts-preloading knowledge skill`

---

### Task 15: security-mtls-design

**Depends on:** none
**Files:** `agents/skills/claude-code/security-mtls-design/SKILL.md`, `agents/skills/claude-code/security-mtls-design/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-mtls-design
version: '1.0.0'
description: Mutual TLS for service-to-service authentication -- both sides present certificates, eliminating the need for shared secrets or API keys between services
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
  - security-tls-fundamentals
  - security-certificate-management
  - security-microsegmentation
  - security-zero-trust-principles
  - owasp-cryptography
stack_signals: []
keywords:
  - mTLS
  - mutual TLS
  - client certificate
  - service mesh
  - SPIFFE
  - service identity
  - certificate authentication
  - two-way TLS
  - zero trust networking
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Mutual TLS Design`
**Tagline:** `> Both sides prove their identity with certificates -- the server authenticates to the client and the client authenticates to the server, establishing a cryptographically verified service-to-service channel`

**When to Use:**

- Authenticating services to each other in a microservices architecture
- Implementing zero trust networking where network location is not sufficient for trust
- Replacing API keys or shared secrets for service-to-service communication
- Deploying a service mesh (Istio, Linkerd, Cilium) with automatic mTLS
- Building internal PKI for workload identity
- Meeting compliance requirements for encrypted and authenticated internal traffic

**Threat Context:**
Standard TLS authenticates only the server -- the client verifies the server's certificate, but the server has no cryptographic proof of the client's identity. In service-to-service communication, this means any service on the network can call any other service. API keys or bearer tokens add authentication but are static, shared, and vulnerable to theft. mTLS provides mutual cryptographic authentication: each service has its own certificate, and both sides verify the other's identity during the TLS handshake. The 2017 Equifax breach exploited flat internal networking with no service authentication -- internal services trusted any connection from the internal network.

**Instructions:**

1. **Deploy an internal CA.** Use Vault PKI, step-ca (Smallstep), cfssl, or a service mesh's built-in CA. Do not use Let's Encrypt for internal mTLS (Let's Encrypt certificates are publicly trusted and should be for public-facing services). Internal CAs issue certificates trusted only within your organization's trust store.
2. **Issue short-lived certificates.** 24-72 hour certificate lifetimes eliminate the need for revocation infrastructure. If a certificate is compromised, it expires within hours. Automate certificate rotation with cert-manager (Kubernetes), Vault Agent, or the service mesh's automatic certificate rotation.
3. **Use SPIFFE for workload identity.** SPIFFE (Secure Production Identity Framework for Everyone) standardizes workload identity as a URI: `spiffe://cluster.local/ns/production/sa/payment-service`. SPIRE (the reference implementation) acts as a workload attestation agent that verifies workload identity and issues SVID (SPIFFE Verifiable Identity Document) certificates. Service meshes (Istio, Linkerd) implement SPIFFE-compatible identity.
4. **Configure certificate validation correctly.** Both client and server must validate the peer's certificate: check the certificate chain (signed by a trusted CA), check the certificate is not expired, check the SAN (Subject Alternative Name) matches the expected service identity. Do not disable certificate verification in production -- ever. `InsecureSkipVerify: true` defeats the entire purpose of mTLS.
5. **Enforce mTLS at the network level.** In Kubernetes, use PeerAuthentication policies (Istio) or NetworkPolicy with identity selectors (Cilium) to ensure that only mTLS connections are accepted. STRICT mode rejects any plaintext connection. This prevents accidental fallback to unencrypted communication.
6. **Handle the migration from plaintext to mTLS.** In brownfield environments, deploy mTLS in PERMISSIVE mode first (accept both plaintext and mTLS). Monitor which services are still sending plaintext. Migrate them one by one. Once all services use mTLS, switch to STRICT mode. Istio's PeerAuthentication supports per-namespace and per-service PERMISSIVE/STRICT mode.

**Details:**

- **mTLS handshake**: Show the full TLS handshake with client authentication: ClientHello -> ServerHello + Server Certificate + CertificateRequest -> Client Certificate + ClientKeyExchange + CertificateVerify -> Server verifies client cert -> encrypted channel established. The CertificateRequest from the server triggers the client to present its certificate. The CertificateVerify message proves the client holds the private key.
- **Service mesh mTLS**: In Istio, envoy sidecars handle mTLS transparently. The application sends plaintext to localhost; the sidecar encrypts with mTLS; the destination sidecar decrypts; the application receives plaintext. No application code changes required. Linkerd uses a similar architecture. Cilium uses eBPF for more efficient mTLS without sidecars.
- **SPIFFE/SPIRE deep dive**: SPIRE server (central authority, maintains the signing CA and registration entries), SPIRE agent (runs on each node, attests workloads, distributes SVIDs). Workload attestation uses platform-specific selectors: Kubernetes service account name, Docker container ID, AWS instance metadata. This ensures that only the legitimate workload receives the certificate for its identity.
- **Debugging mTLS failures**: Common failure modes: certificate not trusted (wrong CA in trust store), SAN mismatch (certificate SAN does not match the expected hostname), expired certificate, clock skew (certificate appears not-yet-valid or expired due to system time differences), certificate chain incomplete (missing intermediate CA). Tools: `openssl s_client` with `--cert` and `--key` flags, `istioctl authn tls-check`, service mesh dashboards.

**Anti-Patterns:**

1. **`InsecureSkipVerify: true` in production.** This disables certificate validation, meaning any certificate (even self-signed, expired, or for the wrong identity) is accepted. This provides encryption but zero authentication -- a MITM with any certificate can intercept traffic.
2. **Long-lived client certificates.** Certificates with 1-year lifetimes require revocation infrastructure (CRLs, OCSP) that is complex and unreliable. Use short-lived certificates (24-72 hours) with automatic rotation.
3. **Sharing client certificates across services.** If all services use the same client certificate, you cannot distinguish between services and cannot implement per-service authorization. Each service must have its own unique identity certificate.
4. **mTLS without authorization.** mTLS proves identity but does not enforce authorization. After verifying the client's certificate identity (e.g., `payment-service`), you still need to check whether `payment-service` is authorized to access the requested endpoint. Use service mesh authorization policies (Istio AuthorizationPolicy, Cilium NetworkPolicy).
5. **Manual certificate distribution.** Copying certificates to servers manually does not scale and leads to expiration outages. Automate with SPIRE, cert-manager, Vault Agent, or service mesh automatic rotation.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-mtls-design knowledge skill`

---

### Task 16: security-dependency-auditing

**Depends on:** none
**Files:** `agents/skills/claude-code/security-dependency-auditing/SKILL.md`, `agents/skills/claude-code/security-dependency-auditing/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-dependency-auditing
version: '1.0.0'
description: Vulnerability scanning, lockfile integrity, update strategies, and managing the security risk of third-party dependencies
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
  - security-sbom-provenance
  - security-code-signing
  - security-shift-left-design
  - owasp-dependency-security
stack_signals: []
keywords:
  - dependency audit
  - vulnerability scanning
  - SCA
  - npm audit
  - Snyk
  - Dependabot
  - lockfile
  - CVE
  - supply chain
  - transitive dependency
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Dependency Auditing`
**Tagline:** `> Your application is 90% third-party code -- scan it for known vulnerabilities, lock it to exact versions, and have a strategy for when a critical CVE drops on a Friday afternoon`

**When to Use:**

- Setting up dependency vulnerability scanning for a project
- Responding to a CVE in a direct or transitive dependency
- Designing an update strategy that balances security with stability
- Auditing lockfile integrity to detect supply chain tampering
- Evaluating SCA (Software Composition Analysis) tools
- Meeting compliance requirements for dependency management

**Threat Context:**
The 2021 Log4Shell vulnerability (CVE-2021-44228, CVSS 10.0) affected nearly every Java application through the ubiquitous Log4j library. Organizations with dependency scanning and automated update pipelines patched within hours; those without took weeks or months. The 2018 event-stream npm package compromise inserted a cryptocurrency-stealing payload into a transitive dependency used by millions. The 2022 node-ipc sabotage by its maintainer demonstrated that even trusted packages can become malicious. Your application's security is the security of its weakest dependency.

**Instructions:**

1. **Use lockfiles and verify their integrity.** `package-lock.json` (npm), `yarn.lock`, `pnpm-lock.yaml`, `Pipfile.lock` (Python), `go.sum` (Go), `Gemfile.lock` (Ruby). Lockfiles pin exact versions and record integrity hashes. Run `npm ci` (not `npm install`) in CI to install exactly what the lockfile specifies. Verify lockfile integrity: `npm ci` fails if `package-lock.json` and `package.json` are out of sync.
2. **Scan dependencies in CI.** Run `npm audit`, `pip-audit`, `bundle audit`, or a commercial SCA tool (Snyk, Sonatype, Dependabot, Trivy) in every CI pipeline. Fail the build for critical and high severity vulnerabilities. Triage medium and low severity vulnerabilities on a weekly cadence.
3. **Understand transitive dependencies.** A direct dependency with zero vulnerabilities can bring in a transitive dependency with critical vulnerabilities. `npm ls --all` shows the full dependency tree. `npm audit` scans the full tree. Audit the depth of your dependency tree: if your application has 5 direct dependencies but 500 transitive dependencies, your attack surface is 500 packages.
4. **Design an update strategy.** Semantic versioning gives a heuristic: patch versions (1.2.x) are safe to auto-merge, minor versions (1.x.0) are usually safe but need testing, major versions (x.0.0) require manual review. Use Dependabot or Renovate to automate PR creation for dependency updates. Group minor/patch updates into weekly PRs. Review major updates individually.
5. **Maintain a vulnerability response playbook.** When a critical CVE drops: (1) identify if the vulnerable package is in your dependency tree (`npm ls <package>`), (2) check if a patched version exists, (3) if yes, update and deploy, (4) if no patch exists, evaluate mitigations (WAF rules, input validation, feature flags to disable affected functionality), (5) monitor for exploit attempts in logs.
6. **Pin and minimize dependencies.** Fewer dependencies mean less attack surface. Before adding a dependency, evaluate: can we implement this functionality in 50 lines of code? Is the package actively maintained? How many transitive dependencies does it bring? What is the package's security history? Use tools like `bundlephobia` (npm) to assess dependency weight.

**Details:**

- **SCA tool comparison**: Compare npm audit (built-in, basic), Snyk (comprehensive, developer-friendly, free tier), Dependabot (GitHub-native, automatic PRs), Renovate (flexible, self-hostable), Trivy (open-source, container and filesystem scanning), Sonatype Nexus (enterprise, policy engine). Recommendation: Dependabot or Renovate for automated updates, Snyk or Trivy for vulnerability scanning in CI.
- **Supply chain attack taxonomy**: Typosquatting (publishing `express-js` to catch typos of `express`), dependency confusion (publishing a public package with the same name as a private package), maintainer compromise (stolen npm tokens), malicious update (trusted package pushes a malicious version), build-time compromise (Codecov-style CI/CD attacks).
- **Lockfile manipulation attacks**: An attacker with PR access can modify the lockfile to point to a different package version or a malicious registry. Lockfile-lint and lockfile-lint-api verify that all packages resolve to the expected registry. Include lockfile review in code review process.
- **Emergency patching workflow**: Step-by-step: security advisory received -> check `npm audit` / `pip-audit` / `bundle audit` -> identify affected services -> check if patch is available -> if yes: update lockfile, run tests, deploy to staging, verify, deploy to production -> if no patch: implement WAF rule or configuration workaround, set a reminder to check for patch daily.

**Anti-Patterns:**

1. **No lockfile in the repository.** Without a lockfile, `npm install` resolves the latest version of every dependency, meaning builds are non-reproducible and a malicious update is automatically pulled in. Always commit lockfiles.
2. **Ignoring npm audit warnings.** "There are 47 moderate vulnerabilities" becomes background noise and is ignored. Triage vulnerabilities: fix critical/high immediately, schedule medium/low for weekly review, document accepted risks.
3. **Updating dependencies only when something breaks.** Waiting until a production incident forces a dependency update means you are always updating under pressure. Proactive weekly updates are less risky than emergency updates.
4. **Trusting download counts as a security signal.** Popular packages get compromised too (event-stream had millions of downloads). Evaluate: maintenance activity, security audit history, dependency depth, and maintainer reputation.
5. **Using `npm install` in CI instead of `npm ci`.** `npm install` can update the lockfile. `npm ci` installs exactly what the lockfile specifies and fails if it does not match `package.json`. Use `npm ci` in CI for reproducible, secure builds.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-dependency-auditing knowledge skill`

---

### Task 17: security-sbom-provenance

**Depends on:** none
**Files:** `agents/skills/claude-code/security-sbom-provenance/SKILL.md`, `agents/skills/claude-code/security-sbom-provenance/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-sbom-provenance
version: '1.0.0'
description: Software bill of materials, SLSA framework, and build provenance -- proving what went into your software and how it was built
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
  - security-dependency-auditing
  - security-code-signing
  - security-ci-security-testing
  - owasp-dependency-security
stack_signals: []
keywords:
  - SBOM
  - software bill of materials
  - SLSA
  - build provenance
  - supply chain security
  - SPDX
  - CycloneDX
  - attestation
  - in-toto
  - artifact integrity
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# SBOM and Build Provenance`
**Tagline:** `> Know exactly what is in your software (SBOM) and prove how it was built (provenance) -- because you cannot secure what you cannot inventory`

**When to Use:**

- Responding to a new CVE and need to know which deployments include the affected library
- Meeting regulatory requirements for software transparency (US Executive Order 14028, EU Cyber Resilience Act)
- Implementing SLSA (Supply-chain Levels for Software Artifacts) to harden the build pipeline
- Publishing software to customers who require SBOMs
- Auditing the software supply chain for compliance or security review

**Threat Context:**
The 2021 US Executive Order 14028 on Improving Cybersecurity requires SBOMs for software sold to the federal government. The EU Cyber Resilience Act extends similar requirements to all software sold in the EU. Beyond compliance, SBOMs enable rapid vulnerability response: when Log4Shell dropped, organizations with SBOMs identified all affected applications in minutes; those without spent weeks searching. Build provenance (SLSA) addresses the SolarWinds-class attack: proving that the artifact was built from a specific source commit on a specific build system, not tampered with by a compromised build pipeline.

**Instructions:**

1. **Generate SBOMs as part of the build process.** Use SPDX or CycloneDX format (both are ISO standards). Tools: `syft` (Anchore, generates SBOMs for containers and filesystems), `cdxgen` (CycloneDX generator), `spdx-sbom-generator`, `trivy sbom`. Generate the SBOM in CI at the same time as the build artifact. Store the SBOM alongside the artifact.
2. **Include both direct and transitive dependencies.** An SBOM that lists only direct dependencies misses the 90% of the dependency tree that is transitive. Use tools that resolve the full dependency graph. Include: package name, version, license, supplier, and package URL (purl) for each component.
3. **Implement SLSA build provenance.** SLSA defines four levels of supply chain security: L1 (build process is documented), L2 (build service generates provenance attestations), L3 (build service is hardened and provenance is unforgeable), L4 (all dependencies are recursively verified). Start with SLSA L1 (document the build process), move to L2 (use GitHub Actions with `slsa-github-generator` or Sigstore to generate signed provenance), then L3 (use a hardened build service with non-falsifiable provenance).
4. **Sign provenance attestations.** Use in-toto attestations (the standard for build provenance) signed with Sigstore (keyless signing using OIDC identity). The attestation binds the artifact (by digest) to the source commit, builder identity, and build parameters. Consumers verify the attestation to confirm the artifact was built from the expected source.
5. **Store and distribute SBOMs.** Attach SBOMs to container images as OCI artifacts (using `oras`, `cosign`, or `docker buildx` with attestation support). Publish SBOMs in a central repository or SBOM management platform (Dependency-Track, GUAC). Make SBOMs available to customers and auditors upon request.
6. **Use SBOMs for vulnerability management.** Ingest SBOMs into a vulnerability management tool (Dependency-Track, Grype) that correlates SBOM components against vulnerability databases (NVD, OSV, GitHub Advisory Database). When a new CVE is published, immediately identify all affected artifacts and prioritize patching.

**Details:**

- **SPDX vs CycloneDX comparison**: SPDX (Linux Foundation, ISO/IEC 5962:2021): mature, license-focused, supports documents, packages, and files. CycloneDX (OWASP): newer, security-focused, supports components, services, vulnerabilities. Both are valid choices. CycloneDX has better tooling for vulnerability correlation. SPDX has stronger license compliance features. For security-focused SBOM: CycloneDX. For compliance-focused SBOM: SPDX.
- **SLSA levels explained**: L0: no provenance. L1: documentation exists for the build process. L2: provenance is generated by the build service (attestation exists). L3: provenance is generated by a hardened, tamper-resistant build service (non-falsifiable). L4: all transitive dependencies also meet SLSA L4 (hermetic, reproducible builds). Most organizations should target SLSA L2 immediately and L3 within a year.
- **in-toto framework**: Defines a "supply chain layout" that specifies which steps are allowed, who performs them, and what artifacts each step produces. Each step generates a "link" attestation. The final verification checks that all required steps were performed by authorized actors and that artifact digests chain correctly from source to final artifact.
- **GUAC (Graph for Understanding Artifact Composition)**: An open-source project (Google-led) that ingests SBOMs, SLSA attestations, and vulnerability data into a graph database. Enables queries like "which of my deployed artifacts are affected by CVE-2021-44228?" and "what is the full dependency chain from this artifact to Log4j?"

**Anti-Patterns:**

1. **Generating SBOMs only on demand.** An SBOM generated after a CVE is discovered requires re-running the build analysis on the deployed version, which may not be reproducible. Generate SBOMs in CI and store them with every release artifact.
2. **SBOMs without version specificity.** An SBOM that lists "lodash" without a version is useless for vulnerability correlation. Every component must include an exact version and ideally a package URL (purl) for unambiguous identification.
3. **Provenance without verification.** Generating SLSA provenance but never verifying it before deployment. Provenance is only useful if consumers verify it. Integrate provenance verification into the deployment pipeline.
4. **Treating SBOM as a one-time compliance artifact.** SBOMs should be generated for every build, not once per year for an audit. Vulnerability databases update daily; stale SBOMs miss newly disclosed vulnerabilities.
5. **No SBOM for container base images.** The base image (Debian, Alpine, Ubuntu) often contains more packages than the application layer. Include base image components in the SBOM, or layer the application SBOM on top of the base image SBOM.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-sbom-provenance knowledge skill`

---

### Task 18: security-code-signing

**Depends on:** none
**Files:** `agents/skills/claude-code/security-code-signing/SKILL.md`, `agents/skills/claude-code/security-code-signing/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-code-signing
version: '1.0.0'
description: Artifact signing, verification pipelines, Sigstore keyless signing, and ensuring that deployed software was built by trusted parties
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
  - security-sbom-provenance
  - security-hmac-signatures
  - security-asymmetric-encryption
  - security-dependency-auditing
  - owasp-dependency-security
stack_signals: []
keywords:
  - code signing
  - artifact signing
  - Sigstore
  - cosign
  - Fulcio
  - Rekor
  - GPG signing
  - container signing
  - software verification
  - trusted publisher
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Code and Artifact Signing`
**Tagline:** `> Sign every artifact you produce and verify every artifact you consume -- because an unsigned binary could have been built by anyone, including an attacker`

**When to Use:**

- Publishing container images, packages, or binaries that users need to verify
- Implementing a deployment pipeline that rejects unsigned or untrusted artifacts
- Signing git commits and tags for non-repudiation
- Evaluating Sigstore (cosign, Fulcio, Rekor) for keyless signing
- Meeting compliance requirements for software integrity

**Threat Context:**
The 2020 SolarWinds attack injected a backdoor into a legitimate build artifact by compromising the build pipeline. The signed, "trusted" artifact contained malicious code that no signature could detect because the signing happened after the injection. Code signing proves who built the artifact; build provenance (SLSA) proves how it was built. Together they establish a chain of trust from source to deployment. Without artifact signing, a MITM on your container registry or package repository can replace any artifact with a malicious one, and your deployment pipeline will deploy it without question.

**Instructions:**

1. **Sign container images with cosign.** `cosign sign <image-digest>` signs the image and stores the signature in the same OCI registry. Use keyless signing (Sigstore Fulcio) to avoid key management: cosign obtains a short-lived certificate from Fulcio using OIDC identity (GitHub Actions, GitLab CI, Google Workload Identity), signs the artifact, and records the signature in Rekor (the transparency log). No long-lived keys to manage or leak.
2. **Verify signatures before deployment.** In Kubernetes, use a policy engine to enforce signature verification: Kyverno (ClusterPolicy with `verifyImages`), Connaisseur, or Sigstore policy-controller. Reject any unsigned or invalidly signed image at admission time. The deployment pipeline should never deploy an image that has not been verified.
3. **Sign git commits and tags.** Use GPG or SSH key signing for git commits (`git commit -S`). Use GPG for git tags (`git tag -s`). Configure GitHub/GitLab to require signed commits on protected branches. This provides non-repudiation: the committer cannot deny making the commit.
4. **Use Sigstore for keyless signing workflows.** Sigstore eliminates key management: Fulcio issues short-lived certificates (10 minutes) based on OIDC identity, cosign signs the artifact, and Rekor records the signing event in an immutable transparency log. The verifier checks: (1) the signature is valid, (2) the certificate was issued by Fulcio, (3) the signing event exists in Rekor, (4) the OIDC identity matches the expected publisher.
5. **Implement a trusted publisher policy.** Define which identities are authorized to sign which artifacts. Example: only the GitHub Actions workflow in the `org/repo` repository, triggered by a push to the `main` branch, is authorized to sign the `registry.io/org/app` image. This is the policy that Kyverno or the Sigstore policy-controller enforces.
6. **Sign all release artifacts.** Binaries, container images, npm packages, Python wheels, Helm charts -- every artifact you distribute should be signed. Provide verification instructions to consumers. Publish your signing public key or Sigstore identity so consumers can verify independently.

**Details:**

- **Sigstore ecosystem**: Cosign (signing tool), Fulcio (certificate authority, issues short-lived certs based on OIDC), Rekor (transparency log, records all signing events), Gitsign (git commit signing via Sigstore). Keyless signing flow: developer authenticates via OIDC -> Fulcio issues a short-lived certificate -> cosign signs the artifact -> cosign uploads the signature and certificate to the OCI registry -> cosign records the event in Rekor -> verifier checks signature + certificate + Rekor entry.
- **GPG vs SSH vs Sigstore for git signing**: GPG: traditional, complex key management, long-lived keys. SSH: simpler than GPG, supported by GitHub since 2022. Sigstore/Gitsign: keyless, uses OIDC, records in Rekor, no long-lived keys. Recommendation: Sigstore/Gitsign for teams that want minimal key management; GPG for organizations that already have a GPG key infrastructure.
- **Container image verification in Kubernetes**: Show a Kyverno ClusterPolicy that verifies cosign signatures for all images in a namespace. Show how to specify the expected Sigstore identity (OIDC issuer + subject) in the policy. Show the admission webhook rejecting an unsigned image.
- **npm and PyPI signing**: npm supports provenance attestations via Sigstore (npm publish generates SLSA provenance). PyPI supports Trusted Publisher (GitHub Actions OIDC identity linked to a PyPI project). Both enable consumers to verify that the published package was built from the expected repository.

**Anti-Patterns:**

1. **Signing without verifying.** Signing artifacts is useless if the deployment pipeline does not verify signatures. Signing without verification is security theater. Implement admission-time verification.
2. **Long-lived signing keys.** Static signing keys are high-value targets. If the key is stolen, the attacker can sign malicious artifacts. Use Sigstore keyless signing to eliminate long-lived keys, or rotate signing keys frequently with key transparency.
3. **Signing after the artifact is modified.** If the build pipeline modifies the artifact after signing (e.g., re-tagging a Docker image, repackaging a binary), the signature becomes invalid. Sign the final artifact as the last step of the build, and use the digest (not the tag) for verification.
4. **No transparency log.** Without a transparency log (Rekor), a signing key compromise is undetectable. The transparency log provides a public, append-only record of all signing events, enabling detection of unauthorized signatures.
5. **Trusting image tags instead of digests.** Tags are mutable: `latest` can point to different images at different times. Always reference and sign images by digest (`@sha256:abc123`), not by tag. Tags are convenience labels; digests are cryptographic identifiers.

6. Run: `harness validate`
7. Commit: `feat(skills): add security-code-signing knowledge skill`

---

### Task 19: security-shift-left-design

**Depends on:** none
**Files:** `agents/skills/claude-code/security-shift-left-design/SKILL.md`, `agents/skills/claude-code/security-shift-left-design/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-shift-left-design
version: '1.0.0'
description: Integrating threat modeling and security analysis into the design phase -- finding security flaws when they cost $1 to fix instead of $100 in production
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
  - security-threat-modeling-stride
  - security-ci-security-testing
  - security-security-champions
  - owasp-auth-patterns
stack_signals: []
keywords:
  - shift left
  - security by design
  - secure design review
  - security requirements
  - threat modeling in design
  - NIST cost of defects
  - security architecture review
  - design phase security
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# Shift-Left Security Design`
**Tagline:** `> Find security flaws in the design document, not in the penetration test report -- because fixing an architecture flaw costs 100x more after deployment than during design`

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the same 7-section structure. Content must cover: the cost curve of defect remediation (NIST/IBM data), security requirements elicitation techniques, security design review checklists, integrating threat modeling into agile ceremonies (sprint planning, design review, definition of done), and the relationship between shift-left and other secure SDLC practices.

**Anti-Patterns must include:** Security reviews as gatekeeping bottleneck, treating threat modeling as a document rather than a design influence, "security sprint" anti-pattern (batching security work into a dedicated sprint instead of integrating it), and relying solely on automated scanning without design-phase analysis.

4. Run: `harness validate`
5. Commit: `feat(skills): add security-shift-left-design knowledge skill`

---

### Task 20: security-ci-security-testing

**Depends on:** none
**Files:** `agents/skills/claude-code/security-ci-security-testing/SKILL.md`, `agents/skills/claude-code/security-ci-security-testing/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-ci-security-testing
version: '1.0.0'
description: SAST, DAST, SCA, and secrets scanning in CI/CD pipelines -- automated security testing that runs on every commit
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
  - security-shift-left-design
  - security-dependency-auditing
  - security-penetration-testing
  - security-secrets-lifecycle
  - owasp-injection-prevention
  - owasp-dependency-security
stack_signals: []
keywords:
  - SAST
  - DAST
  - SCA
  - secrets scanning
  - CI security
  - pipeline security
  - static analysis
  - dynamic analysis
  - CodeQL
  - Semgrep
  - Trivy
  - gitleaks
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**H1:** `# CI Security Testing`
**Tagline:** `> Run SAST, DAST, SCA, and secrets scanning on every commit -- automated security gates that catch vulnerabilities before they reach production`

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the same 7-section structure. Content must cover: SAST (CodeQL, Semgrep, SonarQube -- pattern-based vs semantic analysis, false positive management), DAST (OWASP ZAP, Burp Suite -- running against staging environments, authenticated scanning), SCA (covered in dependency-auditing, reference it), secrets scanning (gitleaks, truffleHog, GitGuardian -- pre-commit hooks, CI scanning, historical scanning), pipeline hardening (securing the CI/CD system itself -- runner isolation, secret masking, artifact integrity), and false positive management (triage workflows, suppression with justification, metrics).

**Anti-Patterns must include:** Alert fatigue from untuned scanners, security scanning as a separate pipeline stage instead of integrated into existing checks, scanning only the main branch instead of PRs, no triage process for findings, and treating scanner output as a compliance checkbox rather than actionable input.

4. Run: `harness validate`
5. Commit: `feat(skills): add security-ci-security-testing knowledge skill`

---

[checkpoint:human-verify] -- Verify that Tasks 11-20 are complete and correct before continuing with Tasks 21-30.

---

### Task 21: security-penetration-testing

**Depends on:** none
**Files:** `agents/skills/claude-code/security-penetration-testing/SKILL.md`, `agents/skills/claude-code/security-penetration-testing/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-penetration-testing
version: '1.0.0'
description: Penetration test scoping, methodology, rules of engagement, and remediation workflows -- maximizing the value of offensive security assessments
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
  - security-ci-security-testing
  - security-shift-left-design
  - security-threat-modeling-process
  - security-vulnerability-disclosure
  - owasp-injection-prevention
stack_signals: []
keywords:
  - penetration testing
  - pen test
  - red team
  - vulnerability assessment
  - rules of engagement
  - remediation
  - OWASP testing guide
  - PTES
  - bug bounty
  - ethical hacking
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: scoping (black box, gray box, white box), methodology (PTES, OWASP Testing Guide, OSSTMM), rules of engagement (legal authorization, scope boundaries, data handling, communication channels), reporting (severity rating, proof of concept, remediation guidance), remediation workflow (SLA by severity, verification retesting, root cause vs symptom fixing), bug bounty programs (scope, reward structure, triage), and the difference between vulnerability assessment, penetration testing, and red teaming.

**Anti-Patterns must include:** Pen testing as the only security activity, annual pen tests with no interim security testing, scope so narrow it misses real attack paths, no remediation tracking after the report, and treating pen test as pass/fail instead of a learning opportunity.

4. Run: `harness validate`
5. Commit: `feat(skills): add security-penetration-testing knowledge skill`

---

### Task 22: security-security-champions

**Depends on:** none
**Files:** `agents/skills/claude-code/security-security-champions/SKILL.md`, `agents/skills/claude-code/security-security-champions/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-security-champions
version: '1.0.0'
description: Embedding security expertise in development teams through security champion programs -- scaling security knowledge without scaling the security team
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
  - security-shift-left-design
  - security-threat-modeling-process
  - security-ci-security-testing
  - owasp-auth-patterns
stack_signals: []
keywords:
  - security champion
  - security culture
  - security training
  - developer security
  - security advocate
  - secure coding
  - security awareness
  - AppSec program
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: the security champion role (embedded developer, not a gatekeeper), selection criteria (technical aptitude + interest, voluntary participation), training program (OWASP top 10, threat modeling, secure code review, tool usage), responsibilities (security code review on the team, threat model participation, security tool champion, escalation point to security team), communication model (security guild meetings, shared Slack channel, quarterly training), metrics (vulnerabilities found in design review, mean time to remediate, security-related PRs reviewed by champion), and organizational change management.

**Anti-Patterns must include:** Mandatory participation (burns out champions), no dedicated time (champion role is unpaid overtime), security team uses champions as dumping ground for triage, no career path or recognition, and champions without training or authority.

4. Run: `harness validate`
5. Commit: `feat(skills): add security-security-champions knowledge skill`

---

### Task 23: security-log-correlation

**Depends on:** none
**Files:** `agents/skills/claude-code/security-log-correlation/SKILL.md`, `agents/skills/claude-code/security-log-correlation/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-log-correlation
version: '1.0.0'
description: SIEM architecture, correlation rules, alert fatigue management, and turning raw logs into actionable security intelligence
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
  - security-audit-log-design
  - security-compliance-logging
  - security-incident-containment
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - SIEM
  - log correlation
  - security monitoring
  - alert fatigue
  - correlation rules
  - detection engineering
  - Sigma rules
  - threat detection
  - security operations
  - SOC
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: SIEM architecture (log collection, normalization, storage, correlation, alerting), log sources (application logs, authentication logs, network flow logs, cloud audit logs, DNS logs, endpoint detection), correlation rules (multi-source event correlation: failed login + successful login from different IP = account compromise, impossible travel detection, brute force detection), detection engineering (MITRE ATT&CK-aligned detections, Sigma rules for portable detection logic), alert fatigue management (tuning false positives, severity classification, alert triage SLAs, runbook-attached alerts), and SIEM tool comparison (Splunk, Elastic SIEM, Microsoft Sentinel, CrowdStrike, open-source: Wazuh, Security Onion).

**Anti-Patterns must include:** Collecting logs without correlation rules (data lake, not SIEM), alert storms from untuned rules (>100 alerts/day per analyst causes burnout), SIEM as compliance checkbox without active monitoring, no runbooks attached to alerts, and alerting on everything instead of known attack patterns.

4. Run: `harness validate`
5. Commit: `feat(skills): add security-log-correlation knowledge skill`

---

### Task 24: security-compliance-logging

**Depends on:** none
**Files:** `agents/skills/claude-code/security-compliance-logging/SKILL.md`, `agents/skills/claude-code/security-compliance-logging/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-compliance-logging
version: '1.0.0'
description: SOC2, GDPR, HIPAA, and PCI-DSS logging requirements -- what to log, how long to retain it, and how to prove compliance through audit trails
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
  - security-audit-log-design
  - security-log-correlation
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - compliance logging
  - SOC2
  - GDPR
  - HIPAA
  - PCI-DSS
  - audit trail
  - data retention
  - log retention
  - regulatory compliance
  - audit evidence
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: framework-specific requirements (SOC2 CC6/CC7 monitoring and logging controls, GDPR Article 30 records of processing activities and Article 5 data minimization tension with logging, HIPAA audit controls 45 CFR 164.312(b), PCI-DSS Requirement 10 -- track and monitor all access to network resources and cardholder data), log retention periods (SOC2: 1 year minimum, PCI-DSS: 1 year with 3 months immediately available, HIPAA: 6 years, GDPR: purpose-limited retention), what to log vs what not to log (authentication events, authorization decisions, data access, configuration changes -- never log passwords, never log full credit card numbers, mask PII in logs), tamper evidence (append-only logs, WORM storage, log integrity verification), and audit readiness (pre-audit log review, log completeness verification, evidence packaging).

**Anti-Patterns must include:** Logging PII/PHI without masking (creating a new compliance violation while trying to demonstrate compliance), retaining logs forever without policy (GDPR data minimization violation), no centralized log collection (logs on individual servers are not auditable), different logging standards across services (inconsistent evidence), and treating compliance logging as separate from security logging (they should be the same system).

4. Run: `harness validate`
5. Commit: `feat(skills): add security-compliance-logging knowledge skill`

---

### Task 25: security-deserialization-attacks

**Depends on:** none
**Files:** `agents/skills/claude-code/security-deserialization-attacks/SKILL.md`, `agents/skills/claude-code/security-deserialization-attacks/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-deserialization-attacks
version: '1.0.0'
description: Insecure deserialization vulnerabilities -- gadget chains, object injection, and why accepting serialized objects from untrusted sources is inherently dangerous
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
  - security-memory-safety
  - owasp-injection-prevention
stack_signals: []
keywords:
  - deserialization
  - insecure deserialization
  - gadget chain
  - object injection
  - Java serialization
  - pickle
  - PHP unserialize
  - YAML deserialization
  - remote code execution
  - RCE
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: why deserialization is dangerous (deserialization reconstructs objects including their methods, which can execute arbitrary code during reconstruction), language-specific attack vectors (Java: `ObjectInputStream` + Apache Commons Collections gadget chains, Python: `pickle.loads()` executes arbitrary bytecode, PHP: `unserialize()` + `__wakeup()/__destruct()` magic methods, Ruby: `Marshal.load()`, YAML: `yaml.load()` in Python/Ruby executes arbitrary constructors), gadget chain concept (chaining existing classes in the application's classpath to achieve RCE), the 2017 Equifax breach (exploited Apache Struts deserialization vulnerability CVE-2017-5638), mitigations (never deserialize untrusted input, use safe alternatives: JSON instead of native serialization, schema validation, allowlists for permitted classes, integrity verification before deserialization), and detection (identify all deserialization points in the codebase, monitor for anomalous deserialization payloads).

**Anti-Patterns must include:** Deserializing user input with native serialization formats, allowlisting after deserialization (too late -- code executes during deserialization), using `yaml.load()` instead of `yaml.safe_load()`, trusting serialized objects in cookies or URL parameters, and implementing a "fix" by filtering known gadget chains (new chains are discovered regularly).

4. Run: `harness validate`
5. Commit: `feat(skills): add security-deserialization-attacks knowledge skill`

---

### Task 26: security-race-conditions

**Depends on:** none
**Files:** `agents/skills/claude-code/security-race-conditions/SKILL.md`, `agents/skills/claude-code/security-race-conditions/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-race-conditions
version: '1.0.0'
description: TOCTOU vulnerabilities, double-spend attacks, file system races, and the security implications of non-atomic operations in concurrent systems
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
  - security-deserialization-attacks
  - security-injection-families
  - security-session-management
  - owasp-csrf-protection
stack_signals: []
keywords:
  - race condition
  - TOCTOU
  - time of check time of use
  - double spend
  - concurrent vulnerability
  - atomicity
  - file system race
  - check-then-act
  - idempotency
  - optimistic locking
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: TOCTOU (time-of-check-to-time-of-use) pattern (check a condition, then act on it, but the condition changes between check and use), file system race conditions (symlink attacks: check that a file is safe, attacker replaces it with a symlink to /etc/passwd, then write to it), double-spend / double-submit (check balance, deduct, but two concurrent requests both read the original balance -- transferring $100 twice from a $150 balance), web application race conditions (coupon codes used twice, concurrent account creation with same email), database-level mitigations (SELECT FOR UPDATE, serializable isolation, advisory locks, unique constraints), application-level mitigations (idempotency keys, optimistic locking with version columns, atomic compare-and-swap operations), and file system mitigations (O_CREAT|O_EXCL for atomic creation, operations on file descriptors not file names, tmpfile() instead of tmpnam()+open()).

**Anti-Patterns must include:** Check-then-act without holding a lock, using READ COMMITTED isolation for financial transactions (allows phantom reads), relying on application-level uniqueness checks without database constraints, non-atomic file operations with predictable temporary filenames, and assuming single-threaded execution in a multi-instance deployment.

4. Run: `harness validate`
5. Commit: `feat(skills): add security-race-conditions knowledge skill`

---

### Task 27: security-incident-containment

**Depends on:** none
**Files:** `agents/skills/claude-code/security-incident-containment/SKILL.md`, `agents/skills/claude-code/security-incident-containment/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-incident-containment
version: '1.0.0'
description: Incident triage, isolation strategies, evidence preservation, and the first 60 minutes of a security incident -- what to do and what not to touch
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
  - security-forensics-fundamentals
  - security-vulnerability-disclosure
  - security-post-incident-review
  - security-log-correlation
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - incident response
  - incident containment
  - triage
  - isolation
  - evidence preservation
  - breach response
  - security incident
  - IR playbook
  - NIST incident response
  - containment strategy
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: NIST SP 800-61 incident response lifecycle (Preparation, Detection & Analysis, Containment Eradication Recovery, Post-Incident Activity), the first 60 minutes (confirm the incident, assess severity, activate the response team, begin evidence preservation, initial containment), triage framework (severity classification: P1 active data exfiltration, P2 compromised system, P3 vulnerability identified, P4 suspicious activity), containment strategies (network isolation, credential rotation, service shutdown, traffic redirection), evidence preservation (do not reboot compromised systems -- memory forensics is lost, capture disk images before remediation, preserve logs, document timeline), communication plan (internal notification chain, external notification requirements -- GDPR 72 hours, customer communication, law enforcement).

**Anti-Patterns must include:** Rebooting the compromised system (destroys volatile evidence), immediately patching without understanding the full scope (the attacker may have persistence mechanisms on other systems), no predefined incident response plan (every incident becomes ad-hoc), single point of failure in the response team (only one person knows the runbooks), and notification delays (GDPR mandates 72-hour breach notification, delayed notification increases legal liability and reputational damage).

4. Run: `harness validate`
5. Commit: `feat(skills): add security-incident-containment knowledge skill`

---

### Task 28: security-forensics-fundamentals

**Depends on:** none
**Files:** `agents/skills/claude-code/security-forensics-fundamentals/SKILL.md`, `agents/skills/claude-code/security-forensics-fundamentals/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-forensics-fundamentals
version: '1.0.0'
description: Digital forensics for developers -- log analysis, artifact collection, timeline reconstruction, and maintaining chain of custody for evidence
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
  - security-incident-containment
  - security-post-incident-review
  - security-audit-log-design
  - security-log-correlation
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - digital forensics
  - log analysis
  - artifact collection
  - timeline reconstruction
  - chain of custody
  - memory forensics
  - disk imaging
  - evidence preservation
  - IOC
  - indicator of compromise
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: evidence types (volatile: memory, network connections, running processes; non-volatile: disk, logs, configuration files), order of volatility (collect most volatile evidence first: memory > network state > processes > disk), log analysis techniques (correlating timestamps across services, identifying anomalous patterns, reconstructing the attack timeline), artifact collection (memory dumps with LiME/WinPMEM, disk imaging with dd/FTK Imager, log export, configuration snapshots), timeline reconstruction (building a chronological narrative from multiple evidence sources, identifying initial compromise, lateral movement, data exfiltration), chain of custody (documenting who collected what, when, how, and who has accessed it since -- critical for legal proceedings), and indicators of compromise (IOCs: suspicious IP addresses, file hashes, domain names, registry keys -- sharing via STIX/TAXII).

**Anti-Patterns must include:** Modifying evidence during collection (use write-blockers for disk, read-only mounts), analyzing on the live compromised system (use forensic workstation with copies), incomplete timeline (gaps in the timeline mean missed attacker activity), no chain of custody documentation (evidence inadmissible in legal proceedings), and collecting only one type of evidence (logs without memory, or disk without network captures -- missing parts of the attack).

4. Run: `harness validate`
5. Commit: `feat(skills): add security-forensics-fundamentals knowledge skill`

---

### Task 29: security-vulnerability-disclosure

**Depends on:** none
**Files:** `agents/skills/claude-code/security-vulnerability-disclosure/SKILL.md`, `agents/skills/claude-code/security-vulnerability-disclosure/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-vulnerability-disclosure
version: '1.0.0'
description: Responsible disclosure, CVE process, coordinated vulnerability disclosure, and managing the lifecycle from discovery to public advisory
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
  - security-incident-containment
  - security-post-incident-review
  - security-penetration-testing
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - vulnerability disclosure
  - responsible disclosure
  - coordinated disclosure
  - CVE
  - security advisory
  - bug bounty
  - PSIRT
  - security.txt
  - disclosure policy
  - vendor notification
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: disclosure models (full disclosure, responsible/coordinated disclosure, no disclosure), the coordinated disclosure process (researcher finds vulnerability -> contacts vendor -> vendor acknowledges -> vendor develops patch -> coordinated public disclosure with patch available), CVE process (request a CVE ID from a CNA -- CVE Numbering Authority, write the advisory, coordinate publication with the NVD), setting up a vulnerability disclosure program (security.txt per RFC 9116, security@ email, PGP key, disclosure policy, SLA for response and fix), advisory writing (description, affected versions, CVSS score, CWE ID, remediation steps, timeline), PSIRT (Product Security Incident Response Team) role, and legal protections (safe harbor language in disclosure policies, DOJ policy on good-faith security research).

**Anti-Patterns must include:** No disclosure policy (researchers have no way to report, so they disclose publicly or sell to exploit brokers), threatening legal action against researchers (chilling effect, bad press, does not fix the vulnerability), disclosure without a patch available (leaves users vulnerable), ignoring vulnerability reports (researchers escalate to full disclosure), and no CVE assignment (makes it harder for users to track and prioritize the vulnerability).

4. Run: `harness validate`
5. Commit: `feat(skills): add security-vulnerability-disclosure knowledge skill`

---

### Task 30: security-post-incident-review

**Depends on:** none
**Files:** `agents/skills/claude-code/security-post-incident-review/SKILL.md`, `agents/skills/claude-code/security-post-incident-review/skill.yaml`

1. Create directory and `skill.yaml`:

```yaml
name: security-post-incident-review
version: '1.0.0'
description: Blameless post-incident reviews for security incidents -- structured analysis, root cause identification, remediation tracking, and organizational learning
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
  - security-incident-containment
  - security-forensics-fundamentals
  - security-vulnerability-disclosure
  - owasp-logging-monitoring
stack_signals: []
keywords:
  - post-incident review
  - post-mortem
  - blameless retrospective
  - root cause analysis
  - remediation tracking
  - lessons learned
  - incident review
  - five whys
  - contributing factors
  - corrective action
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

2. Create `SKILL.md` (150-250 lines):

**When to Use, Threat Context, Instructions, Details, Anti-Patterns** following the 7-section structure. Content must cover: blameless review principles (focus on systems and processes, not individuals -- blame causes hiding, hiding prevents learning), review structure (timeline reconstruction, contributing factor analysis, five whys for root cause, remediation actions with owners and deadlines, follow-up verification), security-specific PIR elements (attack vector analysis, detection timeline -- how long before we noticed?, dwell time analysis, defense gap identification, control effectiveness assessment), remediation tracking (each action item has: owner, deadline, severity, verification criteria -- track completion rate), sharing and organizational learning (sanitized incident reports shared across teams, pattern recognition across incidents, updating threat models and runbooks), and metrics (mean time to detect, mean time to contain, mean time to remediate, recurrence rate for similar incidents).

**Anti-Patterns must include:** Blame-focused reviews (people hide mistakes, organization does not learn), no follow-through on remediation items (the same incident recurs), writing the review but not distributing it (lessons locked in a document no one reads), treating every incident the same (minor incidents get full review overhead while major incidents get insufficient analysis -- scale the review to the severity), and no review at all (the most dangerous anti-pattern -- the organization learns nothing).

4. Run: `harness validate`
5. Commit: `feat(skills): add security-post-incident-review knowledge skill`

---

[checkpoint:human-verify] -- Verify that Tasks 21-30 are complete and correct before continuing with replication.

---

### Task 31: Cross-platform replication

**Depends on:** Tasks 1-30
**Files:** All 30 skill directories replicated to 3 additional platforms (90 directories, 180 files)

1. For each of the 30 skills, copy the `SKILL.md` and `skill.yaml` from `agents/skills/claude-code/security-<topic>/` to:
   - `agents/skills/gemini-cli/security-<topic>/`
   - `agents/skills/cursor/security-<topic>/`
   - `agents/skills/codex/security-<topic>/`

2. Use a shell loop for efficiency:

```bash
for skill in attack-trees hmac-signatures cryptographic-randomness mfa-design authentication-flows abac-design rebac-design capability-based-security microsegmentation identity-verification vault-patterns environment-variable-risks certificate-management hsts-preloading mtls-design dependency-auditing sbom-provenance code-signing shift-left-design ci-security-testing penetration-testing security-champions log-correlation compliance-logging deserialization-attacks race-conditions incident-containment forensics-fundamentals vulnerability-disclosure post-incident-review; do
  for platform in gemini-cli cursor codex; do
    mkdir -p agents/skills/$platform/security-$skill
    cp agents/skills/claude-code/security-$skill/SKILL.md agents/skills/$platform/security-$skill/
    cp agents/skills/claude-code/security-$skill/skill.yaml agents/skills/$platform/security-$skill/
  done
done
```

3. Verify file count: `find agents/skills/*/security-{attack-trees,hmac-signatures,cryptographic-randomness,mfa-design,authentication-flows,abac-design,rebac-design,capability-based-security,microsegmentation,identity-verification,vault-patterns,environment-variable-risks,certificate-management,hsts-preloading,mtls-design,dependency-auditing,sbom-provenance,code-signing,shift-left-design,ci-security-testing,penetration-testing,security-champions,log-correlation,compliance-logging,deserialization-attacks,race-conditions,incident-containment,forensics-fundamentals,vulnerability-disclosure,post-incident-review} -name "*.md" -o -name "*.yaml" | wc -l` -- expect 240 (30 skills x 4 platforms x 2 files).

4. Run: `harness validate`
5. Commit: `feat(skills): replicate 30 security knowledge skills to all platforms`

---

### Task 32: Final validation

**Depends on:** Task 31
**Files:** none (validation only)

1. Verify all 30 Phase 2 skills exist on all 4 platforms (120 directories, 240 files).
2. Spot-check 5 random SKILL.md files for:
   - All 7 sections present (H1, tagline, When to Use, Threat Context, Instructions, Details, Anti-Patterns)
   - Line count between 150-250
   - No framework-specific code (only pseudocode/language-agnostic patterns)
   - Threat Context names specific attack classes
3. Spot-check 5 random skill.yaml files for:
   - `type: knowledge`
   - `cognitive_mode: advisory-guide`
   - `tier: 3`
   - All 4 platforms listed
   - At least one `owasp-*` in `related_skills` where topically relevant
4. Run: `harness validate`
5. Commit: `chore(skills): validate security fundamentals phase 2 complete`

---

## Dependency Graph

```
Tasks 1-30: independent (all parallelizable)
Task 31: depends on Tasks 1-30
Task 32: depends on Task 31
```

## Checkpoints

- After Task 10: verify first 10 skills
- After Task 20: verify skills 11-20
- After Task 30: verify skills 21-30
- After Task 32: final validation

## Observable Truth Traceability

| Observable Truth                             | Tasks                      |
| -------------------------------------------- | -------------------------- |
| 1. 30 skill directories in claude-code       | Tasks 1-30                 |
| 2. Each has SKILL.md + skill.yaml            | Tasks 1-30                 |
| 3. All 7 sections in correct order           | Tasks 1-30                 |
| 4. Correct metadata in skill.yaml            | Tasks 1-30                 |
| 5. Cross-platform copies                     | Task 31                    |
| 6. No framework-specific code                | Tasks 1-30 (content specs) |
| 7. Specific attack classes in Threat Context | Tasks 1-30 (content specs) |
| 8. harness validate passes                   | Task 32                    |
