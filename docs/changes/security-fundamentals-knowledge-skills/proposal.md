# Security Fundamentals Knowledge Skills

## Overview

45 framework-agnostic knowledge skills teaching durable security principles, threat models, cryptographic primitives, and architectural patterns that make systems secure by construction rather than by checklist.

**Goals:**

- Fill the conceptual gap beneath the existing `owasp-*` implementation checklists
- A complete novice following these skills produces security design work indistinguishable from an expert's
- Bidirectional `related_skills` links create theory-to-practice navigation paths with `owasp-*` skills

**Non-goals:**

- Framework-specific implementation guidance (that is the `owasp-*` skills' job)
- Replacing or deprecating existing `owasp-*` skills
- Penetration testing tooling or exploit development

## Decisions

| Decision                             | Rationale                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flat `security-*` namespace          | Matches Wave 1 `design-*` pattern; `related_skills` cross-references create navigation paths implicitly                                                                                               |
| Clean separation from `owasp-*`      | `security-*` = principles/theory, `owasp-*` = implementation checklists. No duplication, no deprecation                                                                                               |
| Bidirectional `related_skills` links | New `security-*` skills reference relevant `owasp-*` skills and vice versa, creating theory-to-practice paths                                                                                         |
| `Threat Context` section added       | Lightweight adversarial framing between `When to Use` and `Instructions`. Frames the attack surface each skill defends against                                                                        |
| 150-250 lines per SKILL.md           | Wave 1 standard. Enough for worked examples, anti-patterns, real-world citations                                                                                                                      |
| `advisory-guide` cognitive mode      | Knowledge skills advise, they don't execute. Same as Wave 1                                                                                                                                           |
| `type: knowledge`, `tier: 3`         | Same classification as all Wave 1 design skills                                                                                                                                                       |
| All 4 platforms from day one         | claude-code, gemini-cli, cursor, codex — full parity                                                                                                                                                  |
| 45 skills across 12 areas            | Threat modeling (4), crypto (5), auth (4), authz (4), zero-trust (3), secrets (3), transport (4), supply chain (3), secure SDLC (4), audit/SIEM (3), vulnerability classes (4), incident response (4) |

## Technical Design

### Skill File Structure

Each skill gets two files per platform:

```
agents/skills/<platform>/security-<topic>/
  SKILL.md      # 150-250 lines
  skill.yaml    # Metadata
```

### skill.yaml Template

```yaml
name: security-<topic>
version: '1.0.0'
description: <one-line description>
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
  - <other security-* skills>
  - <relevant owasp-* skills>
stack_signals: []
keywords:
  - <5-10 discovery keywords>
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

### SKILL.md Section Order

1. `# <Title>` — H1 with concise topic name
2. `> <tagline>` — One-line blockquote summary
3. `## When to Use` — Bullet list of trigger scenarios
4. `## Threat Context` — 2-4 sentences framing the attack surface. Names specific attack classes this skill defends against
5. `## Instructions` — Numbered steps with expert-level guidance, framework-agnostic pseudocode or language-agnostic patterns
6. `## Details` — Deep dives on subtopics. Attack-to-defense narratives where applicable (case-by-case, not mandatory)
7. `## Anti-Patterns` — Common mistakes with explanation of why they fail

Cross-references are handled entirely via `related_skills` in skill.yaml, not inline links.

### Cross-Reference Strategy

- Each `security-*` skill lists related `security-*` siblings and relevant `owasp-*` skills in `related_skills`
- After all 45 skills are created, update existing `owasp-*` skill.yaml files to add back-references to the new `security-*` skills (bidirectional)
- Related `harness-security-scan` and `harness-security-review` skills also get back-references

### Platform Parity

Identical SKILL.md and skill.yaml across all 4 platform directories (claude-code, gemini-cli, cursor, codex). Copy, not symlink.

## Skill List (45 skills)

### Threat Modeling (4)

- `security-threat-modeling-stride` — STRIDE methodology
- `security-attack-trees` — Attack tree construction and analysis
- `security-trust-boundaries` — Trust boundary identification and data flow diagrams
- `security-threat-modeling-process` — End-to-end threat modeling in practice

### Cryptography Primitives (5)

- `security-symmetric-encryption` — AES, ChaCha20, modes of operation (GCM vs CBC)
- `security-asymmetric-encryption` — RSA, elliptic curves, key exchange
- `security-hashing-fundamentals` — Hash functions, collision resistance, preimage attacks
- `security-hmac-signatures` — HMAC, digital signatures, when to use which
- `security-cryptographic-randomness` — CSPRNG, entropy, nonce generation

### Authentication Design (4)

- `security-credential-storage` — Password hashing, salting, peppering, adaptive cost
- `security-session-management` — Session lifecycle, fixation, binding, timeout
- `security-mfa-design` — MFA factors, TOTP, WebAuthn/passkeys, recovery flows
- `security-authentication-flows` — Login, registration, reset, magic links, SSO

### Authorization Patterns (4)

- `security-rbac-design` — Role-based access control modeling and pitfalls
- `security-abac-design` — Attribute-based access control and policy engines
- `security-rebac-design` — Relationship-based access (Zanzibar model)
- `security-capability-based-security` — Object capabilities vs ambient authority

### Zero Trust (3)

- `security-zero-trust-principles` — Never trust, always verify, least privilege
- `security-microsegmentation` — Network and application-level segmentation
- `security-identity-verification` — Continuous authentication, device trust

### Secrets Management (3)

- `security-secrets-lifecycle` — Rotation, distribution, revocation
- `security-vault-patterns` — HashiCorp Vault, cloud KMS, sealed secrets
- `security-environment-variable-risks` — Why env vars leak and safer alternatives

### Transport Security (4)

- `security-tls-fundamentals` — TLS handshake, cipher suites, certificate chain
- `security-certificate-management` — CA hierarchy, pinning, transparency, ACME
- `security-hsts-preloading` — Strict transport security and preload lists
- `security-mtls-design` — Mutual TLS for service-to-service auth

### Supply Chain Security (3)

- `security-dependency-auditing` — Vulnerability scanning, lockfiles, update strategy
- `security-sbom-provenance` — Software bill of materials, SLSA, build provenance
- `security-code-signing` — Artifact signing, verification, Sigstore

### Secure SDLC (4)

- `security-shift-left-design` — Threat modeling in design phase
- `security-ci-security-testing` — SAST, DAST, SCA in pipelines
- `security-penetration-testing` — Pen test scoping, methodology, remediation
- `security-security-champions` — Embedding security in development teams

### Audit Logging and SIEM (3)

- `security-audit-log-design` — What to log, structured format, tamper evidence
- `security-log-correlation` — SIEM, correlation rules, alert fatigue management
- `security-compliance-logging` — SOC2, GDPR, HIPAA logging requirements

### Vulnerability Classes (4)

- `security-memory-safety` — Buffer overflows, use-after-free, safe language patterns
- `security-injection-families` — SQL, command, LDAP, template — unified mental model
- `security-deserialization-attacks` — Insecure deserialization, gadget chains, mitigations
- `security-race-conditions` — TOCTOU, double-spend, file system races

### Incident Response (4)

- `security-incident-containment` — Triage, isolation, evidence preservation
- `security-forensics-fundamentals` — Log analysis, artifact collection, timeline reconstruction
- `security-vulnerability-disclosure` — Responsible disclosure, CVE process, coordination
- `security-post-incident-review` — Blameless post-mortems, remediation tracking

## Success Criteria

1. All 45 skills exist in all 4 platform directories (180 SKILL.md + 180 skill.yaml = 360 files)
2. Every SKILL.md is 150-250 lines and contains all 7 sections: title, tagline, When to Use, Threat Context, Instructions, Details, Anti-Patterns
3. Every skill.yaml validates against the harness skill schema (`type: knowledge`, `cognitive_mode: advisory-guide`, `tier: 3`)
4. Every `security-*` skill has at least one `owasp-*` skill in `related_skills` where a topical match exists
5. All 12 existing `owasp-*` skills have back-references to relevant `security-*` skills added to their skill.yaml
6. No framework-specific implementation code — pseudocode and language-agnostic patterns only
7. The Threat Context section names specific attack classes (not vague "security risks")
8. `harness validate` passes after all skills are created
9. The novice standard holds: a complete novice following these skills produces security design work indistinguishable from an expert's
10. No content duplication with existing `owasp-*` skills — clean conceptual boundary maintained

## Implementation Order

### Phase 1: Core Skills (~15)

The most foundational skills that other skills build on:

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

### Phase 2: Extended Coverage (~30)

All remaining skills from the full list of 45.

### Phase 3: Cross-References

- Update all 12 `owasp-*` skill.yaml files with back-references to new `security-*` skills
- Update `harness-security-scan` and `harness-security-review` with back-references
- Verify all `security-*` to `security-*` sibling links are consistent

Each phase follows the same autopilot structure as Wave 1 (design skills).
