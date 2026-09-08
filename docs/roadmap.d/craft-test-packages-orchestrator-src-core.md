---
slug: "craft-test-packages-orchestrator-src-core"
milestone: "Craft Pipeline"
order: 209
---

### craft: test quality in packages/orchestrator/src/core

- **Status:** planned
- **Spec:** —
- **Summary:** Filed by craft-fleet from a real `test-craft` run pinned to base SHA `b72ede296851`. 14 findings above the noise floor across 6 rubrics (TEST-R001, TEST-R002, TEST-R003, TEST-R006, TEST-R007, TEST-R008), composite tier x impact score 4. Highest-ranked: `TEST-R008` (polish/medium/medium) on `packages/orchestrator/src/core/interaction-queue.test.ts`. Routed `file` rather than `elevate` by the mechanical elevation-eligibility boundary; no line of code was changed. Carries a downgraded elevation: the elevate half of this target was withheld because the baseline was not clean at the pinned base SHA (`harness validate` exit 1, `harness check-deps` exit 1), so no autonomous rewrite could be proven behaviour-preserving. Cite provenance: runId 6cfa0f3c-aec3-49a8-93d2-ed471a9afd3d. Full verbatim critique in the issue.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2003
