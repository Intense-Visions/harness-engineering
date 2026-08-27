---
slug: "judge-calibration-against-realized-outcomes"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 128
---

### Measure whether reviewer confidence means anything

- **Status:** planned
- **Spec:** —
- **Summary:** Review agents emit verdicts with confidence (CONFIRMED/PLAUSIBLE, severity ranks, pass/fail), and every downstream decision — merge, escalate, quarantine — treats those labels as meaningful. Nothing checks them against reality. Metrology's answer is calibration: join each verdict to its realized outcome (did the flagged defect surface? did the passed change later revert or cause an incident?) and produce per-judge reliability curves and Brier scores. A judge whose "90% confident" findings are real 60% of the time is systematically mispricing risk, and every gate threshold tuned against it is wrong. Build: outcome joins via the provenance chain (`emit-provenance-trailer-from-agent-commits` supplies the key), per-reviewer and per-fault-class calibration tracking, recalibrated thresholds served back to the gate stack, and drift alerts when a model or prompt change silently shifts a judge's calibration. Complements `mutation-testing-the-gate-stack` (which measures detection against *known* faults) and `capture-recapture-defect-estimation` (which estimates the unseen population): this one measures whether the confidence attached to any verdict is worth the electrons it is written with.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1560
