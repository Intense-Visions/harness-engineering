---
slug: "basal-token-metabolism"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 143
---

### Basal token metabolism — separating maintenance burn from productive spend

- **Status:** planned
- **Spec:** —
- **Summary:** Bioenergetics separates basal metabolic rate — the energy an organism burns just existing — from activity. Token accounting today has no such split: re-verification of unchanged state, CI re-runs, context re-serialization, graph refresh, idle-loop polling, and re-derivation of already-known facts are booked identically to new productive work, so the system's maintenance burn is invisible and therefore unmanaged. Classify all token spend into basal (spend that produces no new artifact, decision, or verified fact) vs. anabolic (spend that does), per workflow class, from existing telemetry. Two payoffs: first, the basal share is the single accountability metric for the whole compression family — layout, compaction, dictionaries, and progressive encoding all succeed exactly insofar as basal share falls while output holds; second, basal decomposition ranks the waste (which maintenance loop burns most), turning 'we spend too many tokens' into a ranked fix list. Biology also warns what to expect: basal share grows with organism size, so the metric matters more at fleet scale than at single-agent scale — and a fleet whose basal share grows superlinearly with its size has a design problem no per-agent optimization will fix.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1628
