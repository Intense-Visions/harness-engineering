---
slug: "craft-naming-packages-orchestrator-src-core"
milestone: "Craft Pipeline"
order: 207
---

### craft: identifier naming in packages/orchestrator/src/core

- **Status:** planned
- **Spec:** —
- **Summary:** Filed by craft-fleet from a real `naming-craft` run pinned to base SHA `b72ede296851`. 5 findings above the noise floor across 3 rubrics (NAME-R001, NAME-R003, NAME-R006), composite tier x impact score 6. Highest-ranked: `NAME-R006` (foundational/medium/high) on `packages/orchestrator/src/core/retry.ts`. Routed `file` rather than `elevate` by the mechanical elevation-eligibility boundary; no line of code was changed. Cite provenance: runId f7927dfb-4051-4e15-93dd-0e3db3e5d05e. Full verbatim critique in the issue.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2001
