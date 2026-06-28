---
slug: "harness-craft-pipeline-orchestrator"
milestone: "Craft Pipeline"
order: 0
---

### harness:craft-pipeline orchestrator

- **Status:** blocked
- **Spec:** —
- **Summary:** Initiative parent. Cross-domain LLM-judgment ceiling pipeline that composes domain-specific craft skills the same way harness:docs-pipeline composes documentation skills and harness:design-pipeline composes design skills. Each sub-project is a domain-specific ceiling-raiser to a rule-based floor counterpart. Pattern established by design-craft-elevator (design-pipeline sub-project #6, the prototype) and codified in ADRs 0018 (LLM-judgment skill pattern), 0019 (3-axis output model), 0020 (living-catalog H pattern), 0021 (detect-and-offer B' pattern). Sub-projects: #1 naming-craft (cross-cutting), #2 docs-craft, #3 test-craft, #4 code-craft, #5 copy-craft (errors + log lines + commit messages), #6 spec-craft, #7 api-craft, #8 cli-ergonomics, #9 knowledge-craft, #10 security-craft (judgment-based threat modeling). design-craft-elevator (design-pipeline #6) is a peer member by composition (kept in design-pipeline initiative for cohesion with the rest of the design family). Each sub-project ships its own catalog (rubrics + patterns + exemplars) and shares the LLM provider, finding schema, and growth infrastructure from ADRs 0018-0021. Orchestrator phases mirror docs-pipeline / design-pipeline: FRESHEN catalog freshness → JUDGE (run each craft skill) → SUGGEST (POLISH-equivalent across all skills) → BENCHMARK (against per-domain exemplars) → REPORT.
- **Blockers:** craft-pipeline sub-project #2: docs-craft, craft-pipeline sub-project #4: code-craft, craft-pipeline sub-project #7: api-craft, craft-pipeline sub-project #8: cli-ergonomics
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#374
