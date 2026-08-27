---
slug: "gate-cavitation-detection"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 142
---

### Cavitation detection — load-conditioned gate-quality collapse warnings

- **Status:** planned
- **Spec:** —
- **Summary:** A pump pushed past capacity cavitates: local pressure drops below vapor pressure, voids form, and the damage appears later and elsewhere. A review pipeline pushed past attention capacity does the same — quality voids form while every gate still 'runs' and still reports green: approval latency collapses toward zero, pass rates spike, comment depth and finding density drop, overrides rise. The voids collapse later as incidents, far from where they formed. The detector is cheap and specific: condition gate-quality metrics on throughput, and alarm on the cavitation signature — quality metrics degrading as a function of load, per gate, per reviewer-class, per window. This differs from unconditioned control charts: a gate can look stable on average while cavitating at every load peak, and the load-conditioned view exposes exactly the failure mode that unattended scale produces. The output is an early-warning signal wired to admission control: when a gate cavitates, the correct response is to shed or defer load at admission, not to add more verification downstream of a gate that has stopped resisting.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1611
