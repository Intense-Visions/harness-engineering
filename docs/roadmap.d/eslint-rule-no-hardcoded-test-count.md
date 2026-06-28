---
slug: "eslint-rule-no-hardcoded-test-count"
milestone: "Maintenance: Lint & Deps"
order: 3
---

### ESLint Rule: no-hardcoded-test-count

- **Status:** planned
- **Spec:** —
- **Summary:** New ESLint rule to flag magic-number `toHaveLength(N)` assertions in test files where N matches a registry/array size. Fragile to additions — 2 recurring gotchas in learnings where tool count assertions broke on every new tool. Suggest dynamic `TOOL_DEFINITIONS.length` references.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#224
