---
slug: "role-lens-plan-review"
milestone: "Intake"
order: 41
---

### Role-lens plan review

- **Status:** planned
- **Spec:** —
- **Summary:** Review a *plan* through distinct role lenses before execution, rather than reviewing *code* by persona after it. Harness reviews code by specialist persona (7 review agents) and reviews plans for internal soundness (`harness:soundness-review`, `check_task_independence`, `validate_plan_tasks`) — but never asks "what would a designer / a DevEx engineer / a CEO object to in this plan?" Adopted from `garrytan/gstack` (127.2k stars, MIT), which ships four distinct plan-review lenses: `plan-ceo-review`, `plan-design-review`, `plan-devex-review`, `plan-eng-review`, plus `plan-tune`. The value is catching a plan that is internally coherent but wrong for a stakeholder the author was not thinking about — a failure mode soundness analysis cannot detect by construction. Composes with the existing persona infrastructure (`list_personas`, `run_persona`, `generate_persona_artifacts`) rather than needing new machinery. Feature-level finding: gstack's spine duplicates harness, but its edges do not. Matrix: docs/ideation/external-source-feature-matrix-2026-08-10.md (score 4.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1281
