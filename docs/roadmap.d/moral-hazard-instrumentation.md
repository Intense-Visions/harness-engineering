---
slug: "moral-hazard-instrumentation"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 156
---

### Moral hazard — measuring whether safety nets erode upstream care

- **Status:** planned
- **Spec:** —
- **Summary:** Insurance economics names the effect every layered-defense system suffers and none measures: protection changes behavior — the insured take more risk because the net exists. Applied here: as review gates strengthen, do authors (human and agent) test less? As auto-remediation expands, does deploy care decline? As the merge queue catches semantic conflicts, does pre-merge diligence atrophy? The defense-in-depth roadmap assumes layers add; moral hazard says layers partially cannibalize, and the difference between gross and net protection is currently invisible. Instrument it: natural experiments already exist in the telemetry (gates strengthen at known dates, protections roll out per-repo — difference-in-differences on upstream care metrics: author-run test rates, pre-submit fix rates, spec thoroughness, time-in-verification before submission), with the causal toolkit supplying the estimators. Where hazard is measured real, the insurance industry's mechanisms transfer: deductibles (the author bears a first-loss cost when the net catches their preventable failure — e.g., authoring the regression test), experience rating (already filed as trust tiering — its premiums should reflect caught-preventable rates), and coverage exclusions (classes the net deliberately does not catch, published, so upstream care remains rational). The honest possibility this item must allow: measured hazard may be near zero for agents — that finding is equally valuable, because it licenses aggressive netting.
- **Blockers:** Depends on `contributor-trust-tiering`, `nnt-gate-effectiveness`, and `observational-causal-inference-toolkit`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1678
