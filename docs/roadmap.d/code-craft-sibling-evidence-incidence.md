---
slug: 'code-craft-sibling-evidence-incidence'
milestone: 'v5.0 — Enforcement Hardening'
order: 222
---

### Surface code-craft's sibling-evidence incidence, so a failed index build is not invisible

- **Status:** planned
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** Deferred from `duplication-detection` with its reason verbatim: "Phase 5's index build degrades to `undefined` on `Err` and on an empty discovery, and the reason is DROPPED — so a failed index build is invisible to an operator, who sees a normal run with no sibling evidence in it. Deferred rather than smuggled in because surfacing it changes `CodeCraftOutput`'s shape, the `code_craft` MCP response and the printed page, and it traces to no criterion. What stands in for it meanwhile is Phase 5's end-to-end assertion over the real `collectCodeCraftPrompts(...).pendingPrompts[].userPrompt` string, which makes the wiring falsifiable with no schema change; what it does NOT give is operator visibility into a build that failed." Scope: carry the index-build outcome (count of units with siblings, or the dropped `Err` reason) through `CodeCraftOutput` to the run summary and the MCP response, so "no duplication in this codebase" and "the clone index did not build" stop looking identical.
- **Blockers:** Depends on `duplication-detection`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —
