---
slug: "known-answer-pipeline-drills"
milestone: "v5.0 — Enforcement Hardening"
order: 132
---

### Known-answer drills — seeded defects through the whole pipeline including humans

- **Status:** planned
- **Spec:** —
- **Summary:** Mutation testing (already on the roadmap) measures whether the mechanical gates catch synthetic defects. Capture-recapture estimates how many real defects escape. Neither measures the live end-to-end detection rate of the full pipeline — machine gates plus human reviewers — which is the quantity that actually governs what ships. Run known-answer drills: periodically inject a realistic seeded defect into a controlled change (clearly manifested but not labeled), let the normal pipeline process it, and measure where (or whether) it is caught. This is the known-answer audit from measurement science and the fire-drill from safety engineering: the human link is the only unmeasured detector in the chain and the one automation complacency degrades fastest. Governance is the design core, not an afterthought: drills are announced-in-aggregate (everyone knows drills exist; no one knows which change), never punitive by policy, capped in frequency, hard-blocked from ever reaching a release branch (the drill harness owns the revert), and results are reported as system detection rates, never individual scores.
- **Blockers:** Depends on `capture-recapture-defect-estimation`, `mutation-testing-the-gate-stack`, and `operator-proficiency-against-automation-complacency`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1616
