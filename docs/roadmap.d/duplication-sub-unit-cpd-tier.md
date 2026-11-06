---
slug: 'duplication-sub-unit-cpd-tier'
milestone: 'v5.0 — Enforcement Hardening'
order: 220
---

### Sub-unit / CPD duplication tier — to be justified by what the whole-unit floor misses

- **Status:** planned
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** Deferred from `duplication-detection` with its reason verbatim: "Sub-unit / CPD tier (to be justified by what this ships fails to catch)." The shipped detector is deliberately WHOLE-UNIT (function, method, class) at a Rule-of-Three threshold, a granularity chosen by measurement rather than preference: a probe found 60 whole-unit clone classes against 6,173 sliding-window classes, i.e. a sub-unit tier is ~100x noisier at this corpus and needs its own precision story before it earns a place in the gate stack. The gating condition on this item is therefore evidence, not design: it should be opened only once there is a recorded set of real duplications the whole-unit floor provably does NOT catch. Until that set exists, building the tier would add noise to a surface whose whole value is that an operator can act on its top rows.
- **Blockers:** Depends on `duplication-detection`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —
