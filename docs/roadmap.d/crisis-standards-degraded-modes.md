---
slug: "crisis-standards-degraded-modes"
milestone: "Fleet Family — Batch Orchestration"
order: 144
---

### Crisis standards — pre-authorized degraded operating modes under overload

- **Status:** planned
- **Spec:** —
- **Summary:** Emergency medicine plans for overload before it happens: crisis standards of care are pre-declared, pre-authorized reduced standards — what care changes, at what trigger, authorized by whom, returning to normal how — because deciding standards during the surge produces ad-hoc collapse, inequity, and cover-up. Pipelines under overload today degrade implicitly: cavitation detection (filed) will *observe* gates silently going soft, but nothing *designs* what should happen instead. Declare the degraded modes in advance: for each overload class (review saturation, compute exhaustion, incident surge, rate-limit famine), a pre-authorized mode stating exactly which standards relax (batch sizes up, sampling fractions down, low-tier auto-approval widens), which never relax (security gates, guarded actions, protected paths — the inviolable floor), entry triggers tied to measured signals, exit criteria, and the audit trail every mode transition writes. The moral core imported from medicine: degradation happens either way under sufficient load — the choice is between a designed, bounded, auditable reduction and a silent, unbounded one. Crisis standards convert the cavitation alarm from 'quality is collapsing somewhere' into 'engage mode B, which we agreed to in daylight.'
- **Blockers:** Depends on `gate-cavitation-detection`, `policy-level-human-control`, `queueing-model-for-pipeline-capacity`, and `threshold-authorization-m-of-n`
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1654
