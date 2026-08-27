---
slug: "taguchi-loss-gate-verdicts"
milestone: "v5.0 — Enforcement Hardening"
order: 141
---

### Taguchi loss — continuous quality loss instead of binary gate verdicts

- **Status:** planned
- **Spec:** —
- **Summary:** Taguchi's insight overturned pass/fail quality control: loss is continuous — quadratic in the distance from target — not a step function at the spec limit, so two parts both 'in spec' can carry very different real losses, and a gate that only says pass/fail destroys exactly the information needed to improve. The gate stack is step functions all the way down: coverage ≥ threshold, complexity ≤ limit, latency ≤ budget — each verdict discarding the distance-to-target that predicts future failures. Keep the binary verdicts for admission (they are cheap to reason about) but record the continuous loss underneath: every thresholded gate also emits its measured distance from target, a per-gate loss function (quadratic default, calibrated where outcome data supports it) converts distances into comparable loss units, and the accumulated loss per change/surface/period becomes a leading indicator the step functions cannot see — a codebase drifting toward its limits shows rising loss while every gate still passes. This is the measurement substrate several filed items quietly want: cavitation detection gains a graded signal instead of pass-rate cliffs, NNR gains severity weighting, and threshold tuning becomes an optimization over a loss surface instead of folklore.
- **Blockers:** Depends on `gate-cavitation-detection`, `goodhart-sentinel-metric-integrity`, and `nnt-gate-effectiveness`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1673
