---
slug: "toulmin-structured-justifications"
milestone: "v5.0 — Enforcement Hardening"
order: 142
---

### Toulmin justifications — machine-checkable argument structure for verdicts

- **Status:** planned
- **Spec:** —
- **Summary:** Argumentation theory's Toulmin model decomposes any practical argument into checkable parts: the claim, the grounds (evidence it rests on), the warrant (why these grounds license this claim), the qualifier (strength and conditions), and the rebuttal (what would defeat it). Agent verdicts today are prose justifications — plausible-sounding, structurally unexaminable, and uniform in confidence regardless of evidence. Require verdict-bearing outputs (review findings, gate judgments, co-sign decisions, escalations) to carry Toulmin structure: grounds must reference real artifacts (the double-entry ledger's credit discipline applied to arguments — a ground with no artifact link is an unbalanced claim), warrants must cite a rule, precedent, or calibrated judgment class, qualifiers must be explicit ('holds unless the config overrides X'), and the rebuttal field states what evidence would flip the verdict. The structure is what downstream machinery needs and prose denies: co-signers check arguments part-by-part instead of re-deriving; standards-of-review deference attaches to specific parts (facts get clear-error, warrants get de novo); the stated rebuttal is a test specification — often mechanically checkable now; and judge calibration localizes failures to bad grounds versus bad warrants, which have different fixes.
- **Blockers:** Depends on `denominator-declaration-in-metric-outputs`, `double-entry-work-ledger`, `judge-calibration-against-realized-outcomes`, `precedent-stare-decisis`, `standards-of-review-deference`, and `threshold-authorization-m-of-n`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1681
