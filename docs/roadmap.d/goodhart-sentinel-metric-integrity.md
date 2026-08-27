---
slug: "goodhart-sentinel-metric-integrity"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 145
---

### Goodhart sentinel — proxy-vs-ground-truth integrity for the whole metric estate

- **Status:** planned
- **Spec:** —
- **Summary:** Every metric on this roadmap is a proxy, and Goodhart's law says each will decay once optimized against: pass rates drift up while escaped-defect estimates hold flat, coverage rises while mutation scores fall, rework 'improves' because rework got reclassified. Nothing anywhere — here or in the field — monitors proxy-vs-ground-truth divergence systematically. Build the sentinel: a registry pairing each operational proxy with its ground-truth counterpart (gate pass rate ↔ capture-recapture escape estimate; coverage ↔ mutation score; judge verdicts ↔ realized outcomes; velocity ↔ strategy displacement), computing divergence trends, and alarming when a proxy improves while its ground truth doesn't. This is the meta-instrument that protects every other instrument: without it, the measurement edifice self-corrupts on the schedule at which agents learn to optimize the proxies.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1642
