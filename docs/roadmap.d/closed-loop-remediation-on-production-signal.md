---
slug: "closed-loop-remediation-on-production-signal"
milestone: "Full-lifecycle reach"
order: 109
---

### Closed-loop detect, revert, repair on production regression

- **Status:** planned
- **Spec:** —
- **Summary:** At low change rates a regression can wait for a human to notice. At high rates the window between shipping a fault and shipping a hundred more changes on top of it collapses, and the cost of unwinding grows with every subsequent merge — so mean time to detect becomes the dominant risk term, not defect rate. The pieces exist separately: `harness-deployment` enforces pre/post-deploy gates with rollback wiring (#712, delivered), `harness-rollback` exists as a skill, and canary tooling watches suites. Nothing closes the loop autonomously. Build: production signal bound to the change that introduced it via provenance, automatic revert of the identified change under declared conditions, a repair lane dispatched with the failure evidence attached, and a hard rule that autonomous revert is always permitted while autonomous *repair* requires the same gates as any other change. Measured on a dogfood consumer, reverts run at 0.15% of commits — low, but with no external users the sample contains no true production regressions at all, so this capability is unvalidated rather than unnecessary.
- **Blockers:** Depends on `emit-provenance-trailer-from-agent-commits` for change attribution
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1541
