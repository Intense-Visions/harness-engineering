---
slug: "economic-injury-thresholds"
milestone: "Planning & Process"
order: 139
---

### Economic injury thresholds — intervene on entropy only past the computed break-even

- **Status:** planned
- **Spec:** —
- **Summary:** Integrated pest management replaced calendar spraying with a computed decision rule: the economic injury level is the pest density at which crop damage exceeds intervention cost, and you treat only when monitoring shows the action threshold approaching it — spraying below the threshold costs more than it saves, and prophylactic spraying breeds resistance. Entropy management here is calendar spraying: cleanup fleets and refactoring sweeps run on cadence or intuition, sometimes below the damage threshold (net-negative churn that consumes review attention and destabilizes surfaces for marginal gain) and sometimes far above it (debt serviced long after it started compounding into incident risk). Compute the thresholds: per entropy class (dead code, drift, coupling growth, idiom infestation), estimate the damage function — measured cost the entropy actually imposes (rework attributable, comprehension tax from telemetry, defect correlation) — against the intervention cost (fleet spend, review load, destabilization risk), and derive the action threshold at which intervention breaks even. Monitoring (the detectors already exist) then triggers intervention at the threshold, not the calendar. The IPM resistance warning transfers too: repeated identical interventions select for what they miss — rotate cleanup strategies deliberately.
- **Blockers:** Depends on `cleanup-fleet`, `craft-fleet`, and `rework-rate-instrumentation`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1656
