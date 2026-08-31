---
slug: "perf-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 11
---

### perf-fleet — fan out performance-budget/regression remediation

- **Status:** done
- **Spec:** —
- **Summary:** Candidate member of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. perf-fleet fans out perf-budget and regression analysis over hotspots and critical paths, emitting a batch of optimization PRs. Benchmark-gated: a regression needs a measured before/after, mirroring bug-fleet's reproduction bar. Composes the perf skills / check-perf as its DISPATCH engine.
- **Blockers:** Fold-vs-standalone decision deferred — overlaps cleanup-fleet (hotspots) and bug-fleet (perf-as-defect); may be folded rather than shipped standalone.
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1233
