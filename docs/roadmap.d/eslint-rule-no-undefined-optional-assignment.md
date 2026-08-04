---
slug: "eslint-rule-no-undefined-optional-assignment"
milestone: "Maintenance: Lint & Deps"
order: 2
---

### ESLint Rule: no-undefined-optional-assignment

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #834, merged). New ESLint rule flags `{ optionalField: valueOrUndefined }` assignments that fail with `exactOptionalPropertyTypes`; suggests conditional spread `...(val !== undefined && { field: val })`. Rule implemented at packages/eslint-plugin/src/rules/no-undefined-optional-assignment.ts, registered in the plugin, 13 passing tests. Row was stale — auto-done did not fire because External-ID #223 is the issue number while the merge PR was #834.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#223
