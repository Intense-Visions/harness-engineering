---
slug: "eslint-rule-no-undefined-optional-assignment"
milestone: "Maintenance: Lint & Deps"
order: 2
---

### ESLint Rule: no-undefined-optional-assignment

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag `{ optionalField: valueOrUndefined }` assignments that fail with `exactOptionalPropertyTypes`. 5 recurring gotchas in learnings. Suggest conditional spread `...(val !== undefined && { field: val })` instead.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#223
