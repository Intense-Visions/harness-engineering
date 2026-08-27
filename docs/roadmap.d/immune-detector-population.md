---
slug: "immune-detector-population"
milestone: "v5.0 — Enforcement Hardening"
order: 134
---

### Immune detector dynamics — negative selection, clonal expansion, memory cells

- **Status:** planned
- **Spec:** —
- **Summary:** Rule-based gates catch anticipated failures; the immune system's architecture catches unanticipated ones, and its three mechanisms transfer cleanly. Negative selection: train detectors on 'self' — the empirical distribution of normal changes for this codebase (diff shapes, idiom profiles, dependency-touch patterns, timing) — and flag non-self for scrutiny, catching the novel anomaly no rule anticipated (the typicality work is the seed of this; this generalizes it into a managed detector population). Clonal expansion: when a detector's flag is confirmed real by downstream review, spawn variants of that detector (perturbed thresholds, adjacent features) so detection capacity concentrates where threats actually are. Memory cells: after any confirmed incident, distill a cheap, fast, specific detector for that failure class and retain it permanently — the second occurrence of anything should be caught at a fraction of the first's cost. The near-miss ledger records events; this is the complementary machinery that *evolves the detector fleet* in response to them, with population management (birth from confirmations, death from sustained false-positive rates) so the fleet tracks the threat landscape instead of the threat landscape's history.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** github:Intense-Visions/harness-engineering#1613
