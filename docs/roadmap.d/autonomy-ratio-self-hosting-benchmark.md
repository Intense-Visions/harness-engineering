---
slug: "autonomy-ratio-self-hosting-benchmark"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 148
---

### The autonomy ratio — a published self-hosting benchmark

- **Status:** planned
- **Spec:** —
- **Summary:** Compilers proved themselves by self-hosting; no agent-orchestration project publishes the equivalent number. Define and publish the autonomy ratio: the fraction of this project's own development shipped through its own unattended pipeline, with declared denominators and the same measurement rigor the roadmap demands elsewhere (stability across windows, no cherry-picked numerator, human-touch minutes counted honestly — a one-line human fix reclassifies the item). Break it down by lifecycle stage (ideation, spec, build, verify, land) so the number is diagnostic, not just promotional: the stages where the ratio is lowest are, by construction, the next automation targets — the benchmark and the backlog-prioritizer are the same artifact. Publish it in the repo and keep it current mechanically; a stale or hand-edited number is worse than none. It is nearly free (the telemetry exists), uniquely credible (measured on the measurer), and the single most persuasive adoption artifact the project can produce.
- **Blockers:** Depends on `denominator-declaration-in-metric-outputs`, `emit-provenance-trailer-from-agent-commits`, and `stability-gate-on-ranked-outputs`
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1638
