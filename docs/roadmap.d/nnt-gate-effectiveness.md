---
slug: "nnt-gate-effectiveness"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 153
---

### Number-needed-to-run — clinical effectiveness accounting for gates

- **Status:** planned
- **Spec:** —
- **Summary:** Clinical medicine reports treatment value as number-needed-to-treat: how many patients must receive the treatment to prevent one adverse outcome — the honest denominator that separates a drug that works from one that is merely prescribed, and its sibling number-needed-to-harm prices the side effects. Gates deserve the same accounting: number-needed-to-run — how many executions of this gate to prevent one escaped defect — computed from catch records and escape estimates, alongside number-needed-to-harm — how many executions per false positive that costs rework or blocks good work. Together with per-run cost they yield cost-per-defect-prevented, the single number that makes the gate stack's composition an economic decision instead of an accumulation: a gate with NNR 10,000 and heavy per-run cost is a candidate for demotion to sampling or removal regardless of how reasonable it sounds, and one with NNR 30 is cheap insurance even if noisy. This composes the existing measurement primitives (kill rates from mutation testing, escape estimates from capture-recapture, FP rates from calibration) into the clinician's decision format — treat, sample, or discontinue — applied per gate per task class, with the honesty rule that insufficient data reports as such rather than as effectiveness.
- **Blockers:** Depends on `capture-recapture-defect-estimation`, `judge-calibration-against-realized-outcomes`, `mutation-testing-the-gate-stack`, `skill-value-ledger`, and `statistical-audit-sampling`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1659
