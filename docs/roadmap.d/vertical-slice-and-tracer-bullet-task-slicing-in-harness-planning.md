---
slug: "vertical-slice-and-tracer-bullet-task-slicing-in-harness-planning"
milestone: "Intake"
order: 56
---

### Vertical-slice and tracer-bullet task slicing in harness-planning

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133. harness-planning (agents/skills/claude-code/harness-planning/SKILL.md) has no vertical-slice or tracer-bullet guidance (0 mentions), so plans can slice horizontally (all types, then all services, then all UI), which delays the first end-to-end signal and widens integration risk. mattpocock's to-tickets slices every ticket [UNVERIFIED] as a thin end-to-end vertical slice: the first is a tracer bullet proving the path works end to end. Wide refactors use expand-contract sequencing (add the new shape, migrate callers, remove the old), and blocking edges are wired explicitly. Deliverables: (1) a slicing rule in harness-planning, held in a sibling reference file so the body doesn't grow: the first task is a tracer bullet, each later task is independently demoable/verifiable, and horizontal slicing is flagged; (2) expand-contract as the required sequencing pattern for refactors that touch many callers, encoded as `dependsOn` edges so plan_parallelization can widen the migrate phase safely; (3) a soundness-review check that flags plans whose first verifiable end-to-end signal arrives late (e.g. after more than N tasks); (4) the harness-planner persona and autopilot PLAN phase pick it up. Interacts with plan_parallelization (ADR 0056/0057): vertical slices tend to share files, so the spec should measure the impact on wave width. Mirror across all four platform trees. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2246
