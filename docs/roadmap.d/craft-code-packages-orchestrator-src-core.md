---
slug: "craft-code-packages-orchestrator-src-core"
milestone: "Craft Pipeline"
order: 210
---

### craft: code readability in packages/orchestrator/src/core

- **Status:** planned
- **Spec:** —
- **Summary:** Filed by craft-fleet from a real `code-craft` run pinned to base SHA `b72ede296851`. 14 findings above the noise floor across 7 rubrics (CODE-R001, CODE-R002, CODE-R003, CODE-R004, CODE-R005, CODE-R006, CODE-R007), composite tier x impact score 4. Highest-ranked: `CODE-R007` (polish/medium/high) on `packages/orchestrator/src/core/retry.ts`. Routed `file` rather than `elevate` by the mechanical elevation-eligibility boundary; no line of code was changed. Carries a downgraded elevation: the elevate half of this target was withheld because the baseline was not clean at the pinned base SHA (`harness validate` exit 1, `harness check-deps` exit 1), so no autonomous rewrite could be proven behaviour-preserving. Cite provenance: runId 45b95b40-5879-4bc7-ac2a-2c82fdcf32cc. Full verbatim critique in the issue.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2004
