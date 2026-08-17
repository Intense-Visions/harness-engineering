---
slug: "lightweight-nightly-micro-loop-primitive"
milestone: "Fleet Family — Batch Orchestration"
order: 15
---

### Lightweight Nightly Micro-Loop Primitive

- **Status:** backlog
- **Spec:** —
- **Summary:** The fleet family is the right tool for a batch of independent findings but the wrong tool for Dex Horthy's team's highest daily-value pattern: fix one thing, open one tiny PR, every night via a cron-triggered "slow loop." Harness's lightest fleet unit (cleanup-fleet) still runs the full five-phase SELECT→CONFIRM→DISPATCH→VERIFY→REPORT apparatus with worktree isolation and a provenance file. harness-maintenance-pipeline is the closest existing piece (report-first, opt-in --fix) but is human-invoked, not a standing cron. Design a genuinely thin primitive — cron trigger + single deterministic check + single small PR, no worktree/provenance ceremony — that sits underneath cleanup-fleet rather than replacing it. Adapted from Dex Horthy/HumanLayer's nightly "slow loop" practice. Adoption #3 from docs/research/dex-horthy-humanlayer-comparison-analysis.md [HORTHY-3]
- **Blockers:** Design decision: standalone loop primitive vs. a lightweight --micro mode on cleanup-fleet / harness-maintenance-pipeline
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1405
