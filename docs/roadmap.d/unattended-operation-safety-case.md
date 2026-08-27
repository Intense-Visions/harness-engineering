---
slug: "unattended-operation-safety-case"
milestone: "v5.0 — Trust & Security Model"
order: 132
---

### Safety cases — structured, evidence-linked arguments for unattended operation

- **Status:** planned
- **Spec:** —
- **Summary:** Nuclear, rail, and defense do not authorize hazardous operation on checklists or vibes: they require a safety case — a structured argument, in goal-structuring notation, that the system is acceptably safe for a declared operation in a declared context, with every claim decomposed into sub-claims and every leaf resting on cited evidence, reviewed as an artifact and re-validated when its context or evidence changes. 'Can this fleet run unattended overnight?' is exactly such an authorization, and today it is answered by accumulated gut feel over scattered mechanisms. Build the safety-case artifact: top-level claim (this fleet, this scope, unattended, acceptable residual risk), argument structure decomposing it (contracts enforced → evidence: contract tests; irreversible actions guarded → evidence: threshold-auth adversarial suite; oversight not aliased → evidence: Nyquist verdict; budget bounded → evidence: governor records), with every leaf linked live to the actual test/telemetry artifact rather than to prose. Live linkage is the teeth: when cited evidence goes stale or red, the case degrades visibly and the authorization it supports is flagged for review. The safety case becomes the reviewable, versionable answer to the only question that gates the whole unattended program: why do we believe this is safe?
- **Blockers:** Depends on `nyquist-bound-on-oversight`, `policy-level-human-control`, `threshold-authorization-m-of-n`, and `unattended-safe-contract-per-fleet-member`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1674
