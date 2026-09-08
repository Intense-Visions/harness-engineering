---
slug: "craft-test-packages-core-src-rehearsal"
milestone: "Craft Pipeline"
order: 212
---

### craft: test quality in packages/core/src/rehearsal

- **Status:** planned
- **Spec:** —
- **Summary:** Filed by craft-fleet from a real `test-craft` run pinned to base SHA `b72ede296851`. 6 findings above the noise floor across 3 rubrics (TEST-R001, TEST-R002, TEST-R008), composite tier x impact score 4. Highest-ranked: `TEST-R008` (polish/medium/high) on `packages/core/src/rehearsal/scoring.test.ts`. Routed `file` rather than `elevate` by the mechanical elevation-eligibility boundary; no line of code was changed. Cite provenance: runId 6cfa0f3c-aec3-49a8-93d2-ed471a9afd3d. Full verbatim critique in the issue.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2006
