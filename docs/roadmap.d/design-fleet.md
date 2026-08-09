---
slug: "design-fleet"
milestone: "Fleet Family — Batch Orchestration"
order: 13
---

### design-fleet — fan out design-system drift remediation

- **Status:** backlog
- **Spec:** —
- **Summary:** Candidate member of the `-fleet` skill family (epic #1194) — the family technique is autonomous fan-out orchestration over an SDLC work-queue, with batch human review and never auto-merge. design-fleet fleet-ifies design-pipeline / detect-design-drift: it fans out design-token and component drift detection, emitting a batch of fixes. Most valuable in design-heavy repos. Composes design-pipeline as its DISPATCH engine.
- **Blockers:** Fold-vs-standalone decision deferred — overlaps cleanup-fleet (drift floor) and craft-fleet (design-craft ceiling); may be folded rather than shipped standalone.
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1231
