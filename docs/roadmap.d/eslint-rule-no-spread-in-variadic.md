---
slug: "eslint-rule-no-spread-in-variadic"
milestone: "Maintenance: Lint & Deps"
order: 0
---

### ESLint Rule: no-spread-in-variadic

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag Math.min(...arr) and Math.max(...arr) patterns that throw RangeError when arrays exceed the JS engine call stack argument limit (~65K). 10 instances in codebase. Suggest reduce-based alternatives.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#220
