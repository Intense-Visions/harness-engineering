---
slug: "docs-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 14
---

### docs-fleet — fan out doc-drift remediation across the codebase

- **Status:** backlog
- **Spec:** —
- **Summary:** Candidate member of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. docs-fleet fleet-ifies docs-pipeline / detect-doc-drift: it fans out doc-drift detection over the codebase, emitting a batch of doc-fix PRs. Composes docs-pipeline as its DISPATCH engine.
- **Blockers:** Fold-vs-standalone decision deferred — overlaps cleanup-fleet (drift floor) and craft-fleet (docs-craft ceiling); likely fold is drift to cleanup-fleet and quality to craft-fleet.
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1230
