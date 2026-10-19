---
slug: "skill-admission-rule-observed-failure-plus-non-composability"
milestone: "Intake"
order: 53
---

### Skill-admission rule: observed failure plus non-composability for new skills

- **Status:** planned
- **Spec:** —
- **Summary:** Wave 1 of ADR-0133. `emit_skill_proposal`'s soundness gate is structural only (packages/orchestrator/src/proposals/gate.ts): it checks the proposal's shape, never whether the behaviour is already composable from the 793 skills that exist, and never whether a real session actually failed without it. mattpocock/skills' SCOPE.md admits a new skill only for an observed failure in a real session, and refuses one outright when "the behaviour composes from existing skills" [UNVERIFIED — external claim, see docs/architecture/mattpocock-skills-comparison/analysis.md §6]. Deliverables: (1) required fields on a skill proposal — the observed failure (session or run reference) and an explicit non-composability argument naming the nearest existing skills considered; (2) a mechanical composability pre-check that runs `search_skills`/`advise_skills` over the proposed trigger and surfaces the top existing candidates in the gate output, so the argument is answered against evidence rather than asserted; (3) the same admission bar applied to `create_skill` and harness-skill-authoring, so the rule is not bypassable by the manual path; (4) a retirement counterpart to decide against — `catalog-retrospective` already flags quiet skills but nothing deletes them. **Scope boundary:** the durable rejected-idea store this rule reads from — records, semantic lookup from ideation and intake, premise-expiry — is NOT in this item. That is the already-filed rejection ledger, `docs/roadmap.d/rejection-ledger-negative-knowledge.md` (#1620), which wave 1 extends with the concrete record form and check sites. This item is only the admission bar for new skills, which #1620 does not cover. Analysis: docs/architecture/mattpocock-skills-comparison/analysis.md §6.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#2243
