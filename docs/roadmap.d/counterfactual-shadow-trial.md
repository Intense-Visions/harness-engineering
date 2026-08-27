---
slug: "counterfactual-shadow-trial"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 138
---

### Counterfactual shadow trial — try-before-you-trust evaluation mode

- **Status:** planned
- **Spec:** —
- **Summary:** Every tool in this space asks for trust up front and pays back evidence later: a prospect must adopt before any evidence about their own repository exists, and failed adoption leaves no trace. Invert that. A sealed shadow mode points the harness at a candidate repository, watches the team's real ticket flow for a bounded window, and silently does the same work in a sandbox — full pipeline, all gates — while shipping nothing. The output is an evidence pack: for each ticket the team closed, the verified PR the harness would have opened, with diff, gate verdicts, wall-clock and token cost, side by side with what the humans shipped. This is the pre-adoption sibling of `controlled-experiment-harness-for-its-own-effect` (which measures effect after adoption and cannot help someone deciding). It converts the adoption decision from a leap of faith into an experiment report, and it is a go-to-market capability rather than a post-adoption one — its value is concentrated entirely in the evaluation window.
- **Blockers:** Depends on `controlled-experiment-harness-for-its-own-effect` and `denominator-declaration-in-metric-outputs`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1607
