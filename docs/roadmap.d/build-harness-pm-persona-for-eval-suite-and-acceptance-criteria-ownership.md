---
slug: "build-harness-pm-persona-for-eval-suite-and-acceptance-criteria-ownership"
milestone: "v5.0 — Article-Framing Docs & Personas"
order: 5
---

### Build harness-pm persona for eval suite and acceptance criteria ownership

- **Status:** done
- **Spec:** docs/changes/harness-pm-persona/proposal.md
- **Summary:** The companion article "AI Ate My Role" defines three surviving Project Manager lanes: Taste PM (product thesis), **Harness PM (eval suite design + acceptance criteria)**, Boundary PM (compliance). The project ships 15 personas — all engineering-shaped (code-reviewer, architecture-enforcer, security-reviewer, performance-guardian, planner, task-executor, etc.). **Zero PM-shaped personas exist.** Build `harness-pm` persona that owns: (a) reviewing every spec's acceptance criteria for observability/testability/completeness, (b) ensuring eval suite coverage matches the spec's user-visible behavior section, (c) catching specs that ship without measurable success criteria. Pairs with `harness:outcome-eval` (which produces the eval verdicts) to give that eval an organizational owner. The article: "Quality became something that happened _to_ the work, not something that lived _inside_ the work. The new role sits at parity with engineering, not downstream." Source: Pass 8 (AI Ate My Role + Anatomy companion articles).
- **Blockers:** Build harness:outcome-eval skill
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#566
