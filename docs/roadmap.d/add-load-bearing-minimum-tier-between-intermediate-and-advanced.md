---
slug: "add-load-bearing-minimum-tier-between-intermediate-and-advanced"
milestone: "v5.0 — Catalog Rationalization"
order: 2
---

### Add "load-bearing minimum" tier between intermediate and advanced

- **Status:** blocked
- **Spec:** —
- **Summary:** Today: basic = layer linter; intermediate = layer linter + 1 forbidden import; advanced = full kit with all the dogfood-inherited overhead. What's missing is a tier between intermediate and advanced — a "load-bearing minimum" template that ships exactly: ESLint plugin + complexity cap (15) + module-size cap + multi-persona review wired into the CI workflow template + harness:outcome-eval skill. The minimum article-aligned harness without the advanced-tier surface area. Source: Pass 3 #12.
- **Blockers:** Build harness:outcome-eval skill, Ship a CI workflow template, Ship a required-review GitHub Action template
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#539
