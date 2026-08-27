---
slug: "capture-recapture-defect-estimation"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 121
---

### Estimate the defects you did not find

- **Status:** planned
- **Spec:** —
- **Summary:** Every quality figure the harness reports counts *found* problems — review findings, gate failures, reverts — and says nothing about what remains, which is the number that actually governs release confidence. Ecology solved this a century ago: capture-recapture. Mark what one observer finds, see how much a second independent observer's findings overlap, and the overlap estimates the total population including the unseen remainder. The harness already runs multiple independent reviewers (code, security, adversarial, races, typescript-strict) over the same diff; their findings are captures. Build: per-review Lincoln-Petersen (or multi-list log-linear) estimation over the independent reviewers' finding sets, reported as "found 7, overlap pattern implies ~11, estimated 4 latent" — per surface and per release. Two disciplines fall out for free: reviewers must stay genuinely independent (shared context inflates overlap and *understates* latent defects — a measurable bias, so measure it), and a rising latent estimate on a surface is an early-warning signal no counting metric can produce. Nobody in this product category reports what they did not find.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1553
