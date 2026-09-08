---
slug: "craft-cli-ergonomics-packages-cli-src-commands"
milestone: "Craft Pipeline"
order: 202
---

### craft: CLI ergonomics in packages/cli/src/commands

- **Status:** planned
- **Spec:** —
- **Summary:** Filed by craft-fleet from a real `cli-ergonomics-craft` run pinned to base SHA `b72ede296851`. 19 findings above the noise floor across 7 rubrics (CLI-R001, CLI-R002, CLI-R003, CLI-R004, CLI-R005, CLI-R006, CLI-R007), composite tier x impact score 9. Highest-ranked: `CLI-R006` (foundational/large/high) on `packages/cli/src/commands/check-deps.ts`. Routed `file` rather than `elevate` by the mechanical elevation-eligibility boundary; no line of code was changed. Cite provenance: runId 690934e7-ea16-4817-97b9-9af271e90051. Full verbatim critique in the issue.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1996
