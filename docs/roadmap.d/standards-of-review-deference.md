---
slug: "standards-of-review-deference"
milestone: "v5.0 — Enforcement Hardening"
order: 139
---

### Standards of review — calibrated deference for second-level checks

- **Status:** planned
- **Spec:** —
- **Summary:** Appellate courts do not re-try every case: they apply declared standards of review — questions of law are reviewed de novo (no deference), findings of fact for clear error (high deference), discretionary calls for abuse of discretion (highest deference) — because full re-derivation of everything is unaffordable and, worse, substitutes the reviewer's noise for the original's diligence. Second-level checks in the pipeline (re-review, verification of verification, human spot-checks, appeal of gate verdicts) currently have no deference theory: every re-examination is implicitly de novo, which is expensive, or implicitly rubber-stamp, which is worthless — and nothing declares which. Import the doctrine: classify what a second-level check is examining (rule application, factual finding from evidence, discretionary judgment), assign each class a declared standard of review, and have the reviewing layer apply that standard explicitly — re-derive rule applications from scratch, disturb factual findings only on clear error shown from the record, and disturb discretionary calls only for abuse (consideration of forbidden factors, failure to consider required ones). Burden of proof travels with it: the challenger of a standing verdict bears the burden, to a declared standard. The payoff is review economics: deference concentrated where re-derivation adds nothing, full rigor where it adds everything.
- **Blockers:** Depends on `judge-calibration-against-realized-outcomes` and `precedent-stare-decisis`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1663
