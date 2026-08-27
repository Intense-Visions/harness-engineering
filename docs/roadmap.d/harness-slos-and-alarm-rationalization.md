---
slug: "harness-slos-and-alarm-rationalization"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 151
---

### SRE discipline on the harness itself — published SLOs, error budgets, alarm rationalization

- **Status:** planned
- **Spec:** —
- **Summary:** The harness asks adopters to trust it as infrastructure but does not hold itself to infrastructure discipline. Two imports from operations practice, both field-standard elsewhere and absent here. First, SLOs and error budgets on the harness's own service surfaces: dispatch latency, verdict turnaround, gate false-positive rate, pipeline availability — declared targets, measured continuously, with error budgets that gate the harness's own release cadence (a budget-exhausted month means stabilization work, mechanically, not by mood). Second, alarm rationalization from the process industries (the EEMUA-style discipline): the roadmap just minted dozens of new alarms with no alerts-per-operator-hour budget, and alarm flooding is the best-documented way to make every alarm worthless. Rationalize: a standing alarm budget per operator per period, every alarm classed by required response and priority-distribution rules enforced (mostly-low-priority by construction), a periodic review that demotes or merges alarms nobody acts on, and a flood breaker that summarizes rather than streams when the rate exceeds human processing. The two compose: SLOs make the harness's reliability legible; rationalization keeps its signaling channel worth listening to as the instrument count grows.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1643
