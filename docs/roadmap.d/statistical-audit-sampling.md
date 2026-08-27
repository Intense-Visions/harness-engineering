---
slug: "statistical-audit-sampling"
milestone: "v5.0 — Trust & Security Model"
order: 130
---

### Statistical audit sampling — assurance at a declared confidence, not census re-verification

- **Status:** planned
- **Spec:** —
- **Summary:** Auditors certify billion-dollar ledgers without checking every transaction: statistical sampling theory tells them how many items to examine, selected how, to assert with declared confidence that material misstatement is below a threshold — and discovered errors trigger defined escalation (widen the sample, then census the stratum). Verification at scale needs the same discipline and currently improvises it: passport spot-checks, fleet-output reviews, and inbound audits all sample, but with ad-hoc fractions and no confidence statement, so nobody can say what assurance was actually purchased. Import the machinery: stratified sampling plans over populations of agent work (strata by risk tier, task class, author trust), sample sizes computed from declared confidence and tolerable error rates, attribute-sampling evaluation with the standard escalation ladder on discovered deviations, and an assurance statement attached to every sampled verification — 'examined n of N, stratified thus; with 95% confidence the deviation rate is below x%.' The statement is the product: it converts 'we checked some' into a quantified, comparable, and auditable claim, and it composes with everything that samples — passports, drills, inbound triage, fleet verification — replacing their ad-hoc fractions with computed ones.
- **Blockers:** Depends on `inbound-contribution-triage-at-scale`, `known-answer-pipeline-drills`, `transparency-log-for-attestation`, and `verification-passports`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1664
