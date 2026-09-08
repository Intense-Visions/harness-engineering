---
slug: "craft-copy-packages-orchestrator-src-core"
milestone: "Craft Pipeline"
order: 213
---

### craft: prose-in-code in packages/orchestrator/src/core

- **Status:** planned
- **Spec:** —
- **Summary:** Filed by craft-fleet from a real `copy-craft` run pinned to base SHA `b72ede296851`. 10 findings above the noise floor across 2 rubrics (COPY-R007, COPY-R008), composite tier x impact score 2. Highest-ranked: `COPY-R008` (polish/small/medium) on `packages/orchestrator/src/core/budget-governor.ts`. Routed `file` rather than `elevate` by the mechanical elevation-eligibility boundary; no line of code was changed. Carries a downgraded elevation: the elevate half of this target was withheld because the baseline was not clean at the pinned base SHA (`harness validate` exit 1, `harness check-deps` exit 1), so no autonomous rewrite could be proven behaviour-preserving. Cite provenance: runId 2e15fb57-0d99-48bf-b142-3f90b0185bfb. Full verbatim critique in the issue.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2007
