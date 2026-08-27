---
slug: "verification-passports"
milestone: "v5.0 — Trust & Security Model"
order: 128
---

### Verification passports — portable, replayable attestation across boundaries

- **Status:** planned
- **Spec:** —
- **Summary:** Verification evidence today dies at the repository boundary: when a change crosses repos or organisations, the receiver re-verifies from zero because nothing trustworthy travels with it. Build the passport: a signed, content-addressed bundle that accompanies a change — tests executed and their results, coverage and mutation scores, gate verdicts with versions of the gates that produced them, provenance chain from intent to diff — structured so a receiver can (a) verify the signature chain cheaply, (b) spot-check by replaying a random subset rather than re-running everything, and (c) price the residual risk of not re-running the rest. This extends `transparency-log-for-attestation` (local, append-only) into portability, and composes with knowledge federation into machine-to-machine intake lanes between installations. It is the one feature class with true network effects: each new adopter makes every existing adopter's inbound cheaper. Zero-knowledge-style claims (prove 'coverage ≥ X' without revealing sources) are a follow-on, not v1.
- **Blockers:** Depends on `contributor-trust-tiering`, `cross-project-knowledge-federation`, `machine-pre-review-for-untrusted-changes`, and `transparency-log-for-attestation`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1624
