---
slug: "transparency-log-for-attestation"
milestone: "v5.0 — Trust & Security Model"
order: 124
---

### Make the attestation chain tamper-evident, not just recorded

- **Status:** planned
- **Spec:** —
- **Summary:** `emit-provenance-trailer-from-agent-commits` records who and what produced a change; a trailer in a commit message is mutable history — rebases rewrite it, and a compromised pipeline can forge it. The supply-chain world already built the answer: append-only transparency logs (Merkle-tree backed, the certificate-transparency / sigstore pattern), where each entry is provably included and the log is provably append-only, so tampering is detectable by anyone with the log head. Build: every gate verdict, policy version, attestation and dispatch decision appended to a per-project transparency log; inclusion proofs attached to releases; and a verifier any auditor can run offline. This is the difference between "our records say the security gate passed" and "here is a proof the security gate verdict existed before the release and has not been altered" — the standard regulated industries already accept for artifact signing, applied to the process itself. Turns the compliance story from trust-us into check-it-yourself, which is the only version that survives an audit run by a skeptic.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1556
